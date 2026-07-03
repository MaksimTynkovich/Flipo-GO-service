package websocket

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	GameType string
	once     sync.Once
}

type Hub struct {
	mu        sync.RWMutex
	clients   map[string]map[*Client]bool
	broadcast map[string]chan []byte
}

func NewHub() *Hub {
	h := &Hub{
		clients:   make(map[string]map[*Client]bool),
		broadcast: make(map[string]chan []byte),
	}
	for _, game := range []string{"roulette", "crash", "pvp"} {
		h.clients[game] = make(map[*Client]bool)
		h.broadcast[game] = make(chan []byte, 256)
		go h.runBroadcast(game)
	}
	return h
}

func (h *Hub) runBroadcast(gameType string) {
	for msg := range h.broadcast[gameType] {
		h.mu.RLock()
		clients := make([]*Client, 0, len(h.clients[gameType]))
		for client := range h.clients[gameType] {
			clients = append(clients, client)
		}
		h.mu.RUnlock()

		for _, client := range clients {
			select {
			case client.Send <- msg:
			default:
				h.removeClient(client)
			}
		}
	}
}

func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[client.GameType][client]; !ok {
		return
	}
	delete(h.clients[client.GameType], client)
	client.closeSend()
}

func (c *Client) closeSend() {
	c.once.Do(func() {
		close(c.Send)
	})
}

func (h *Hub) Broadcast(gameType string, data []byte) {
	select {
	case h.broadcast[gameType] <- data:
	default:
		slog.Warn("broadcast channel full", "game", gameType)
	}
}

func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.GameType][client] = true
}

func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[client.GameType][client]; !ok {
		return
	}
	delete(h.clients[client.GameType], client)
	client.closeSend()
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister(c)
		_ = c.Conn.Close()
	}()
	for {
		if _, _, err := c.Conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) WritePump() {
	defer func() { _ = c.Conn.Close() }()
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}

func ServeWS(hub *Hub, gameType string, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &Client{
		Hub:      hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		GameType: gameType,
	}
	hub.Register(client)
	go client.WritePump()
	client.ReadPump()
}

func JSONMessage(event string, payload interface{}) []byte {
	msg := map[string]interface{}{
		"event":   event,
		"payload": payload,
	}
	data, _ := json.Marshal(msg)
	return data
}

// NotifyGameTick pushes live state to connected WS clients without a Redis hop.
func (h *Hub) NotifyGameTick(gameType string, data []byte) {
	h.Broadcast(gameType, JSONMessage("tick", json.RawMessage(data)))
}
