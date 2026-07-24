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

type AdminClient struct {
	Hub    *Hub
	Conn   *websocket.Conn
	Send   chan []byte
	UserID uuid.UUID
	once   sync.Once
}

func (h *Hub) initAdminHub() {
	if h.adminBroadcast != nil {
		return
	}
	h.adminClients = make(map[*AdminClient]bool)
	h.adminBroadcast = make(chan []byte, 256)
	go h.runAdminBroadcast()
}

func (h *Hub) runAdminBroadcast() {
	for msg := range h.adminBroadcast {
		h.adminMu.RLock()
		clients := make([]*AdminClient, 0, len(h.adminClients))
		for client := range h.adminClients {
			clients = append(clients, client)
		}
		h.adminMu.RUnlock()

		for _, client := range clients {
			select {
			case client.Send <- msg:
			default:
				h.removeAdminClient(client)
			}
		}
	}
}

func (h *Hub) removeAdminClient(client *AdminClient) {
	h.adminMu.Lock()
	defer h.adminMu.Unlock()
	if _, ok := h.adminClients[client]; !ok {
		return
	}
	delete(h.adminClients, client)
	client.closeSend()
}

func (c *AdminClient) closeSend() {
	c.once.Do(func() {
		close(c.Send)
	})
}

func (h *Hub) RegisterAdmin(client *AdminClient) {
	h.initAdminHub()
	h.adminMu.Lock()
	defer h.adminMu.Unlock()
	h.adminClients[client] = true
}

func (h *Hub) UnregisterAdmin(client *AdminClient) {
	h.adminMu.Lock()
	defer h.adminMu.Unlock()
	if _, ok := h.adminClients[client]; !ok {
		return
	}
	delete(h.adminClients, client)
	client.closeSend()
}

// NotifyAdmins pushes an event to all connected admin panel sockets.
func (h *Hub) NotifyAdmins(event string, payload interface{}) {
	if h == nil {
		return
	}
	h.initAdminHub()
	select {
	case h.adminBroadcast <- JSONMessage(event, payload):
	default:
	}
}

// BroadcastAdminNotification pushes a new notification + unread count to admin sockets.
func (h *Hub) BroadcastAdminNotification(notif *domain.AdminNotification, unreadCount int64) {
	if h == nil || notif == nil {
		return
	}
	h.NotifyAdmins("admin.notification", map[string]interface{}{
		"notification": notif,
		"unread_count": unreadCount,
	})
}

func (c *AdminClient) ReadPump() {
	defer func() {
		c.Hub.UnregisterAdmin(c)
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

func (c *AdminClient) WritePump() {
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

func ServeAdminWS(hub *Hub, authSvc *auth.Service, w http.ResponseWriter, r *http.Request) {
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
	if !authSvc.CanAccessAdmin(claims) {
		http.Error(w, "Нужны права администратора", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &AdminClient{
		Hub:    hub,
		Conn:   conn,
		Send:   make(chan []byte, 64),
		UserID: claims.UserID,
	}
	hub.RegisterAdmin(client)
	go client.WritePump()
	client.ReadPump()
}
