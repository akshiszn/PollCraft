package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
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

// --- Globals ---
var (
	MongoClient    *mongo.Client
	RedisClient    *redis.Client
	PollCollection *mongo.Collection
	UserCollection *mongo.Collection
	jwtSecret      []byte
	upgrader       = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

// --- WebSocket Hub ---
type Hub struct {
	clients  map[string]map[*websocket.Conn]bool
	register chan struct {
		pollID string
		conn   *websocket.Conn
	}
	unregister chan struct {
		pollID string
		conn   *websocket.Conn
	}
	mu sync.Mutex
}

var hub = Hub{
	clients: make(map[string]map[*websocket.Conn]bool),
	register: make(chan struct {
		pollID string
		conn   *websocket.Conn
	}),
	unregister: make(chan struct {
		pollID string
		conn   *websocket.Conn
	}),
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
			if _, ok := h.clients[unreg.pollID]; ok {
				delete(h.clients[unreg.pollID], unreg.conn)
				unreg.conn.Close()
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) Broadcast(pollID string, data interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.clients[pollID]; ok {
		for client := range clients {
			if err := client.WriteJSON(data); err != nil {
				client.Close()
				delete(clients, client)
			}
		}
	}
}

// --- DB Initialization ---
func initDatabases() {
	_ = godotenv.Load()
	jwtSecret = []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) == 0 {
		jwtSecret = []byte("pollcraft_super_secret_key_2026")
	}

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
		})

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

	// CORS Setup
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Auth Handlers
	r.POST("/api/auth/signup", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Email and password are required"})
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var existing User
		if err := UserCollection.FindOne(ctx, bson.M{"email": req.Email}).Decode(&existing); err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Account already exists with this email"})
			return
		}

		hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
		user := User{Email: req.Email, Password: string(hash)}

		res, err := UserCollection.InsertOne(ctx, user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
			return
		}

		objID := res.InsertedID.(bson.ObjectID)
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": objID.Hex(),
			"exp": time.Now().Add(time.Hour * 72).Unix(),
		})
		tokenString, _ := token.SignedString(jwtSecret)

		c.JSON(http.StatusCreated, gin.H{"token": tokenString, "email": user.Email})
	})

	r.POST("/api/auth/login", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email or password format"})
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var user User
		err := UserCollection.FindOne(ctx, bson.M{"email": req.Email}).Decode(&user)
		if err != nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": user.ID.Hex(),
			"exp": time.Now().Add(time.Hour * 72).Unix(),
		})
		tokenString, _ := token.SignedString(jwtSecret)

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
			if err := c.ShouldBindJSON(&req); err != nil || len(req.Options) < 2 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Please provide a question and at least 2 options"})
				return
			}

			userID := c.GetString("userID")
			opts := make([]Option, len(req.Options))
			initialVotes := make(map[string]int64)

			for i, optText := range req.Options {
				optID := fmt.Sprintf("opt_%d", i+1)
				opts[i] = Option{ID: optID, Text: optText}
				initialVotes[optID] = 0
			}

			poll := Poll{
				Question:  req.Question,
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

			// Seed Redis Hash
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

	// 📍 Fetch User's Created Polls (Dashboard Route with Redis Vote Sync)
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

		// Enrich each poll with live Redis vote totals & defaults
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
		}
		poll.TotalVotes = sum
		poll.IsActive = true

		c.JSON(http.StatusOK, poll)
	})

	// Vote Route (Updated to support ClientID per browser session)
	r.POST("/api/polls/:id/vote", func(c *gin.Context) {
		pollID := c.Param("id")
		var req VotePayload
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Option ID required"})
			return
		}

		// Use ClientID sent from frontend localStorage; fallback to ClientIP if absent
		voterID := req.ClientID
		if voterID == "" {
			voterID = c.ClientIP()
		}

		ctx := context.Background()

		rateKey := fmt.Sprintf("vote_lock:%s:%s", pollID, voterID)
		set, err := RedisClient.SetNX(ctx, rateKey, "1", 24*time.Hour).Result()
		if err != nil || !set {
			c.JSON(http.StatusForbidden, gin.H{"error": "You have already voted on this poll"})
			return
		}

		redisKey := "poll:" + pollID
		newCount, err := RedisClient.HIncrBy(ctx, redisKey, req.OptionID, 1).Result()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store vote"})
			return
		}

		allCounts, _ := RedisClient.HGetAll(ctx, redisKey).Result()
		votes := make(map[string]int64)
		for k, v := range allCounts {
			count, _ := strconv.ParseInt(v, 10, 64)
			votes[k] = count
		}

		go func() {
			objID, _ := bson.ObjectIDFromHex(pollID)
			PollCollection.UpdateOne(
				context.Background(),
				bson.M{"_id": objID},
				bson.M{"$set": bson.M{fmt.Sprintf("votes.%s", req.OptionID): newCount}},
			)
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
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}

		hub.register <- struct {
			pollID string
			conn   *websocket.Conn
		}{pollID: pollID, conn: conn}

		defer func() {
			hub.unregister <- struct {
				pollID string
				conn   *websocket.Conn
			}{pollID: pollID, conn: conn}
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
