package websocket

import (
	"net/http"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type UserClient struct {
	Hub        *Hub
	Conn       *websocket.Conn
	Send       chan []byte
	UserID     uuid.UUID
	TelegramID int64
	once       sync.Once
}

type userEnvelope struct {
	userID uuid.UUID
	data   []byte
}

func (h *Hub) initUserHub() {
	if h.userBroadcast != nil {
		return
	}
	h.userClients = make(map[uuid.UUID]map[*UserClient]bool)
	h.userBroadcast = make(chan userEnvelope, 256)
	go h.runUserBroadcast()
}

func (h *Hub) runUserBroadcast() {
	for msg := range h.userBroadcast {
		h.userMu.RLock()
		clients := make([]*UserClient, 0, len(h.userClients[msg.userID]))
		for client := range h.userClients[msg.userID] {
			clients = append(clients, client)
		}
		h.userMu.RUnlock()

		for _, client := range clients {
			select {
			case client.Send <- msg.data:
			default:
				h.removeUserClient(client)
			}
		}
	}
}

func (h *Hub) removeUserClient(client *UserClient) {
	h.userMu.Lock()
	defer h.userMu.Unlock()
	if set, ok := h.userClients[client.UserID]; ok {
		delete(set, client)
		if len(set) == 0 {
			delete(h.userClients, client.UserID)
		}
	}
	client.closeSend()
}

func (c *UserClient) closeSend() {
	c.once.Do(func() {
		close(c.Send)
	})
}

func (h *Hub) RegisterUser(client *UserClient) {
	h.initUserHub()
	h.userMu.Lock()
	defer h.userMu.Unlock()
	if h.userClients[client.UserID] == nil {
		h.userClients[client.UserID] = make(map[*UserClient]bool)
	}
	h.userClients[client.UserID][client] = true
}

func (h *Hub) UnregisterUser(client *UserClient) {
	h.userMu.Lock()
	defer h.userMu.Unlock()
	if set, ok := h.userClients[client.UserID]; ok {
		if _, ok := set[client]; ok {
			delete(set, client)
			if len(set) == 0 {
				delete(h.userClients, client.UserID)
			}
		}
	}
	client.closeSend()
}

// OnlineUserCount returns unique authenticated user-WS sessions, optionally skipping admins.
func (h *Hub) OnlineUserCount(skipAdmin func(telegramID int64) bool) int {
	if h == nil {
		return 0
	}
	h.initUserHub()
	h.userMu.RLock()
	defer h.userMu.RUnlock()
	count := 0
	for _, set := range h.userClients {
		if len(set) == 0 {
			continue
		}
		var telegramID int64
		for c := range set {
			telegramID = c.TelegramID
			break
		}
		if skipAdmin != nil && skipAdmin(telegramID) {
			continue
		}
		count++
	}
	return count
}

func (h *Hub) BalanceUpdated(userID uuid.UUID, balanceNanoton, deltaNanoton int64, ledgerType domain.LedgerType) {
	h.NotifyUser(userID, "balance.updated", map[string]interface{}{
		"betting_balance": balanceNanoton,
		"delta_nanoton":   deltaNanoton,
		"ledger_type":     string(ledgerType),
	})
}

func (h *Hub) NotifyUser(userID uuid.UUID, event string, payload interface{}) {
	h.initUserHub()
	select {
	case h.userBroadcast <- userEnvelope{
		userID: userID,
		data:   JSONMessage(event, payload),
	}:
	default:
	}
}

func (c *UserClient) ReadPump() {
	defer func() {
		c.Hub.UnregisterUser(c)
		_ = c.Conn.Close()
	}()
	_ = c.Conn.SetReadDeadline(time.Now().Add(wsPongWait))
	c.Conn.SetPongHandler(func(string) error {
		return c.Conn.SetReadDeadline(time.Now().Add(wsPongWait))
	})
	for {
		if _, _, err := c.Conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *UserClient) WritePump() {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func ServeUserWS(hub *Hub, authSvc *auth.Service, w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}
	claims, err := authSvc.ParseToken(token)
	if err != nil {
		http.Error(w, "Недействительный токен", http.StatusUnauthorized)
		return
	}
	user, err := authSvc.GetUser(r.Context(), claims.UserID)
	if err != nil || user == nil {
		http.Error(w, "Недействительный токен", http.StatusUnauthorized)
		return
	}
	if user.IsBanned && !authSvc.IsAdmin(user.TelegramID) {
		http.Error(w, "Аккаунт заблокирован", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &UserClient{
		Hub:        hub,
		Conn:       conn,
		Send:       make(chan []byte, 64),
		UserID:     claims.UserID,
		TelegramID: user.TelegramID,
	}
	hub.RegisterUser(client)
	go client.WritePump()
	client.ReadPump()
}
