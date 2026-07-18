package websocket

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
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

	userMu        sync.RWMutex
	userClients   map[uuid.UUID]map[*UserClient]bool
	userBroadcast chan userEnvelope
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

		dropped := 0
		for _, client := range clients {
			select {
			case client.Send <- msg:
			default:
				dropped++
				h.removeClient(client)
			}
		}
		if dropped > 0 {
			slog.Warn("ws clients dropped (slow consumer)", "game", gameType, "dropped", dropped, "remaining", len(clients)-dropped)
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
	_ = c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		if _, _, err := c.Conn.ReadMessage(); err != nil {
			break
		}
		_ = c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	}
}

func (c *Client) WritePump() {
	// Cloudflare proxies idle WebSockets ~100s; ping keeps the tunnel alive.
	ping := time.NewTicker(25 * time.Second)
	defer func() {
		ping.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ping.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
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
