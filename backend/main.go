package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// --- Structs ---

type User struct {
	ID       bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Email    string        `bson:"email" json:"email"`
	Password string        `bson:"password" json:"-"`
}

type Option struct {
	ID   string `bson:"id" json:"id"`
	Text string `bson:"text" json:"text"`
}

type Poll struct {
	ID         bson.ObjectID    `bson:"_id,omitempty" json:"id"`
	Question   string           `bson:"question" json:"question"`
	Options    []Option         `bson:"options" json:"options"`
	CreatedBy  string           `bson:"created_by" json:"createdBy"`
	CreatedAt  time.Time        `bson:"created_at" json:"createdAt"`
	Votes      map[string]int64 `bson:"votes" json:"votes"`
	TotalVotes int64            `bson:"-" json:"totalVotes"`
	IsActive   bool             `bson:"-" json:"isActive"`
}

type VotePayload struct {
	OptionID string `json:"option_id" binding:"required"`
	ClientID string `json:"client_id"`
}

// --- Limits & tunables ---

const (
	maxQuestionLen  = 300
	maxOptionLen    = 100
	minOptions      = 2
	maxOptions      = 10
	minPasswordLen  = 8
	maxPasswordLen  = 72 // bcrypt limit
	maxClientIDLen  = 64
	maxBodyBytes    = 1 << 20 // 1 MB
	maxWSPerPoll    = 500
	wsReadLimit     = 512
	wsPongWait      = 60 * time.Second
	wsPingEvery     = 30 * time.Second
	wsWriteDeadline = 2 * time.Second
)

// --- Globals ---

var (
	MongoClient    *mongo.Client
	RedisClient    *redis.Client
	PollCollection *mongo.Collection
	UserCollection *mongo.Collection

	jwtSecret      []byte
	allowedOrigins = map[string]bool{}

	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return allowedOrigins[r.Header.Get("Origin")]
		},
	}
)

// --- WebSocket Hub ---

type Hub struct {
	clients    map[string]map[*websocket.Conn]bool
	register   chan wsReg
	unregister chan wsReg
	mu         sync.Mutex
}

type wsReg struct {
	pollID string
	conn   *websocket.Conn
}

var hub = Hub{
	clients:    make(map[string]map[*websocket.Conn]bool),
	register:   make(chan wsReg),
	unregister: make(chan wsReg),
}

func (h *Hub) Run() {
	for {
		select {
		case reg := <-h.register:
			h.mu.Lock()
			if h.clients[reg.pollID] == nil {
				h.clients[reg.pollID] = make(map[*websocket.Conn]bool)
			}
			h.clients[reg.pollID][reg.conn] = true
			h.mu.Unlock()

		case unreg := <-h.unregister:
			h.mu.Lock()
			if conns, ok := h.clients[unreg.pollID]; ok {
				delete(conns, unreg.conn)
				if len(conns) == 0 {
					delete(h.clients, unreg.pollID)
				}
			}
			h.mu.Unlock()
			unreg.conn.Close()
		}
	}
}

func (h *Hub) Broadcast(pollID string, data interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.clients[pollID]; ok {
		for client := range clients {
			// Deadline so one slow client can't stall everyone else.
			client.SetWriteDeadline(time.Now().Add(wsWriteDeadline))
			if err := client.WriteJSON(data); err != nil {
				client.Close()
				delete(clients, client)
			}
		}
	}
}

func (h *Hub) countFor(pollID string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients[pollID])
}

// --- Helpers ---

func loadOrigins() {
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowedOrigins[o] = true
		}
	}
	if len(allowedOrigins) == 0 {
		log.Println("WARNING: ALLOWED_ORIGINS not set; defaulting to http://localhost:5173 only")
		allowedOrigins["http://localhost:5173"] = true
	}
}

// allow implements a simple fixed-window rate limiter in Redis.
func allow(key string, max int64, window time.Duration) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	n, err := RedisClient.Incr(ctx, key).Result()
	if err != nil {
		return false
	}
	if n == 1 {
		RedisClient.Expire(ctx, key, window)
	}
	return n <= max
}

// realIP returns the client IP. Behind a reverse proxy (Render), the proxy's
// address is what gin sees, so we read the first X-Forwarded-For entry.
// NOTE: that header can be spoofed by a determined client, so IP-based
// limits are friction, not a hard guarantee.
func realIP(c *gin.Context) string {
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		first := strings.TrimSpace(strings.Split(xff, ",")[0])
		if ip := net.ParseIP(first); ip != nil {
			return ip.String()
		}
	}
	return c.ClientIP()
}

func validObjectID(id string) bool {
	_, err := bson.ObjectIDFromHex(id)
	return err == nil
}

func issueToken(userID string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour * 72).Unix(),
	})
	return token.SignedString(jwtSecret)
}

// --- DB Initialization ---

func initDatabases() {
	_ = godotenv.Load()

	jwtSecret = []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) < 32 {
		log.Fatal("JWT_SECRET must be set and at least 32 characters long")
	}

	loadOrigins()

	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}

	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("MongoDB Connection Error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx, nil); err != nil {
		log.Fatalf("MongoDB Ping Error: %v", err)
	}

	MongoClient = client
	db := client.Database("pollcraft_db")
	PollCollection = db.Collection("polls")
	UserCollection = db.Collection("users")

	// Unique email index so duplicate signups can't race through.
	// Not fatal if it fails (e.g. duplicates already exist in the collection).
	_, idxErr := UserCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if idxErr != nil {
		log.Printf("WARNING: could not create unique email index: %v", idxErr)
	}

	redisURI := os.Getenv("REDIS_URI")
	if redisURI == "" {
		redisURI = "redis://localhost:6379"
	}

	opt, err := redis.ParseURL(redisURI)
	if err != nil {
		log.Fatalf("Redis Parse Error: %v", err)
	}
	RedisClient = redis.NewClient(opt)

	if _, err := RedisClient.Ping(context.Background()).Result(); err != nil {
		log.Fatalf("Redis Ping Error: %v", err)
	}

	fmt.Println("Backend Connected to MongoDB & Redis Successfully!")
}

// --- JWT Middleware ---

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if len(tokenString) < 7 || tokenString[:7] != "Bearer " {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized access"})
			c.Abort()
			return
		}
		tokenString = tokenString[7:]

		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("userID", claims["sub"])
		}
		c.Next()
	}
}

func main() {
	initDatabases()
	go hub.Run()

	r := gin.Default()
	r.SetTrustedProxies(nil)

	// Cap request body size (does not affect WebSocket upgrades).
	r.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
		c.Next()
	})

	// CORS: only allow configured origins.
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" && allowedOrigins[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// --- Auth Handlers ---

	r.POST("/api/auth/signup", func(c *gin.Context) {
		if !allow("rl:signup:"+realIP(c), 10, time.Hour) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many attempts. Try again later."})
			return
		}

		var req struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Email and password are required"})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))
		if _, err := mail.ParseAddress(email); err != nil || len(email) > 254 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Please enter a valid email address"})
			return
		}
		if len(req.Password) < minPasswordLen || len(req.Password) > maxPasswordLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Password must be %d-%d characters", minPasswordLen, maxPasswordLen)})
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var existing User
		if err := UserCollection.FindOne(ctx, bson.M{"email": email}).Decode(&existing); err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Account already exists with this email"})
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
			return
		}

		user := User{Email: email, Password: string(hash)}
		res, err := UserCollection.InsertOne(ctx, user)
		if err != nil {
			if mongo.IsDuplicateKeyError(err) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Account already exists with this email"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
			return
		}

		objID, ok := res.InsertedID.(bson.ObjectID)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
			return
		}

		tokenString, err := issueToken(objID.Hex())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"token": tokenString, "email": user.Email})
	})

	r.POST("/api/auth/login", func(c *gin.Context) {
		if !allow("rl:login:"+realIP(c), 10, 15*time.Minute) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many attempts. Try again later."})
			return
		}

		var req struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email or password format"})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var user User
		err := UserCollection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
		if err != nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		tokenString, err := issueToken(user.ID.Hex())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": tokenString, "email": user.Email})
	})

	// --- PROTECTED ROUTES ---

	protected := r.Group("/api/polls")
	protected.Use(AuthMiddleware())
	{
		// Create Poll
		protected.POST("", func(c *gin.Context) {
			var req struct {
				Question string   `json:"question" binding:"required"`
				Options  []string `json:"options" binding:"required"`
			}

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Please provide a question and at least 2 options"})
				return
			}

			question := strings.TrimSpace(req.Question)
			if question == "" || len(question) > maxQuestionLen {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Question must be 1-%d characters", maxQuestionLen)})
				return
			}
			if len(req.Options) < minOptions || len(req.Options) > maxOptions {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Provide %d-%d options", minOptions, maxOptions)})
				return
			}

			userID := c.GetString("userID")

			opts := make([]Option, len(req.Options))
			initialVotes := make(map[string]int64)

			for i, raw := range req.Options {
				text := strings.TrimSpace(raw)
				if text == "" || len(text) > maxOptionLen {
					c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Each option must be 1-%d characters", maxOptionLen)})
					return
				}
				optID := fmt.Sprintf("opt_%d", i+1)
				opts[i] = Option{ID: optID, Text: text}
				initialVotes[optID] = 0
			}

			poll := Poll{
				Question:  question,
				Options:   opts,
				CreatedBy: userID,
				CreatedAt: time.Now(),
				Votes:     initialVotes,
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			res, err := PollCollection.InsertOne(ctx, poll)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create poll"})
				return
			}

			objID, ok := res.InsertedID.(bson.ObjectID)
			if !ok {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Driver Insert ID assertion error"})
				return
			}
			pollID := objID.Hex()

			// Seed Redis hash (these fields are the source of truth for valid option IDs)
			redisKey := "poll:" + pollID
			for optID := range initialVotes {
				RedisClient.HSet(ctx, redisKey, optID, 0)
			}

			poll.ID = objID
			poll.TotalVotes = 0
			poll.IsActive = true

			c.JSON(http.StatusCreated, gin.H{"id": pollID, "poll": poll})
		})
	}

	// Fetch User's Created Polls (Dashboard Route with Redis Vote Sync)
	r.GET("/api/my-polls", AuthMiddleware(), func(c *gin.Context) {
		userID := c.GetString("userID")

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		cursor, err := PollCollection.Find(ctx, bson.M{"created_by": userID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch polls"})
			return
		}
		defer cursor.Close(ctx)

		var polls []Poll
		if err := cursor.All(ctx, &polls); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse polls"})
			return
		}
		if polls == nil {
			polls = []Poll{}
		}

		for i := range polls {
			pollID := polls[i].ID.Hex()
			redisCounts, err := RedisClient.HGetAll(ctx, "poll:"+pollID).Result()

			var sum int64 = 0
			if err == nil && len(redisCounts) > 0 {
				votes := make(map[string]int64)
				for k, v := range redisCounts {
					count, _ := strconv.ParseInt(v, 10, 64)
					votes[k] = count
					sum += count
				}
				polls[i].Votes = votes
			} else {
				for _, count := range polls[i].Votes {
					sum += count
				}
			}
			polls[i].TotalVotes = sum
			polls[i].IsActive = true
		}

		c.JSON(http.StatusOK, polls)
	})

	// Fetch Single Poll
	r.GET("/api/polls/:id", func(c *gin.Context) {
		pollID := c.Param("id")
		objID, err := bson.ObjectIDFromHex(pollID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Poll ID format"})
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var poll Poll
		if err := PollCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&poll); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}

		redisCounts, err := RedisClient.HGetAll(ctx, "poll:"+pollID).Result()
		var sum int64 = 0
		if err == nil && len(redisCounts) > 0 {
			votes := make(map[string]int64)
			for k, v := range redisCounts {
				count, _ := strconv.ParseInt(v, 10, 64)
				votes[k] = count
				sum += count
			}
			poll.Votes = votes
		} else {
			for _, count := range poll.Votes {
				sum += count
			}
		}

		poll.TotalVotes = sum
		poll.IsActive = true

		c.JSON(http.StatusOK, poll)
	})

	// Vote Route
	r.POST("/api/polls/:id/vote", func(c *gin.Context) {
		pollID := c.Param("id")
		if !validObjectID(pollID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Poll ID format"})
			return
		}

		var req VotePayload
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Option ID required"})
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		redisKey := "poll:" + pollID

		// The Redis hash is seeded with valid option IDs at poll creation, so this
		// validates both that the poll exists and that the option belongs to it.
		valid, err := RedisClient.HExists(ctx, redisKey, req.OptionID).Result()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate vote"})
			return
		}
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll or option"})
			return
		}

		// One vote per IP and (if provided) per client ID.
		lockKeys := []string{fmt.Sprintf("vote_lock:%s:ip:%s", pollID, realIP(c))}
		if l := len(req.ClientID); l > 0 && l <= maxClientIDLen {
			lockKeys = append(lockKeys, fmt.Sprintf("vote_lock:%s:cid:%s", pollID, req.ClientID))
		}

		for _, k := range lockKeys {
			set, err := RedisClient.SetNX(ctx, k, "1", 24*time.Hour).Result()
			if err != nil || !set {
				c.JSON(http.StatusForbidden, gin.H{"error": "You have already voted on this poll"})
				return
			}
		}

		if _, err := RedisClient.HIncrBy(ctx, redisKey, req.OptionID, 1).Result(); err != nil {
			// Release locks so the voter can retry.
			RedisClient.Del(ctx, lockKeys...)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store vote"})
			return
		}

		allCounts, _ := RedisClient.HGetAll(ctx, redisKey).Result()
		votes := make(map[string]int64)
		for k, v := range allCounts {
			count, _ := strconv.ParseInt(v, 10, 64)
			votes[k] = count
		}

		// Persist to Mongo with $inc (order-independent, unlike $set of a snapshot).
		optionID := req.OptionID
		go func() {
			bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer bgCancel()
			objID, err := bson.ObjectIDFromHex(pollID)
			if err != nil {
				return
			}
			if _, err := PollCollection.UpdateOne(
				bgCtx,
				bson.M{"_id": objID},
				bson.M{"$inc": bson.M{"votes." + optionID: 1}},
			); err != nil {
				log.Printf("mongo vote persist failed for poll %s: %v", pollID, err)
			}
		}()

		hub.Broadcast(pollID, gin.H{
			"type":   "VOTE_UPDATE",
			"votes":  votes,
			"pollId": pollID,
		})

		c.JSON(http.StatusOK, gin.H{"message": "Vote recorded", "votes": votes})
	})

	// WebSocket Endpoint
	r.GET("/ws/polls/:id", func(c *gin.Context) {
		pollID := c.Param("id")
		if !validObjectID(pollID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Poll ID format"})
			return
		}
		if hub.countFor(pollID) >= maxWSPerPoll {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Too many live connections for this poll"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}

		conn.SetReadLimit(wsReadLimit)
		conn.SetReadDeadline(time.Now().Add(wsPongWait))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(wsPongWait))
			return nil
		})

		hub.register <- wsReg{pollID: pollID, conn: conn}

		done := make(chan struct{})
		defer func() {
			close(done)
			hub.unregister <- wsReg{pollID: pollID, conn: conn}
		}()

		// Heartbeat: WriteControl is safe to call concurrently with other writes.
		go func() {
			ticker := time.NewTicker(wsPingEvery)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)); err != nil {
						return
					}
				case <-done:
					return
				}
			}
		}()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}
