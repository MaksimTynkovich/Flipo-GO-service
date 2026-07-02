package telegram

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type WebAppUser struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Username     string `json:"username"`
	LanguageCode string `json:"language_code"`
	PhotoURL     string `json:"photo_url"`
}

type InitData struct {
	User      *WebAppUser
	AuthDate  time.Time
	QueryID   string
	Raw       string
}

var (
	ErrInvalidInitData = errors.New("invalid telegram init data")
	ErrExpiredInitData = errors.New("telegram init data expired")
)

func ValidateInitData(initData, botToken string, maxAge time.Duration) (*InitData, error) {
	if initData == "" || botToken == "" {
		return nil, ErrInvalidInitData
	}

	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, fmt.Errorf("%w: parse query", ErrInvalidInitData)
	}

	receivedHash := values.Get("hash")
	if receivedHash == "" {
		return nil, fmt.Errorf("%w: missing hash", ErrInvalidInitData)
	}
	values.Del("hash")

	var pairs []string
	for key := range values {
		pairs = append(pairs, key+"="+values.Get(key))
	}
	sort.Strings(pairs)
	dataCheckString := strings.Join(pairs, "\n")

	secret := hmac.New(sha256.New, []byte("WebAppData"))
	secret.Write([]byte(botToken))
	secretKey := secret.Sum(nil)

	mac := hmac.New(sha256.New, secretKey)
	mac.Write([]byte(dataCheckString))
	expectedHash := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedHash), []byte(receivedHash)) {
		return nil, ErrInvalidInitData
	}

	authDateStr := values.Get("auth_date")
	authUnix, err := strconv.ParseInt(authDateStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid auth_date", ErrInvalidInitData)
	}
	authDate := time.Unix(authUnix, 0)
	if time.Since(authDate) > maxAge {
		return nil, ErrExpiredInitData
	}

	result := &InitData{
		AuthDate: authDate,
		QueryID:  values.Get("query_id"),
		Raw:      initData,
	}

	if userJSON := values.Get("user"); userJSON != "" {
		var user WebAppUser
		if err := json.Unmarshal([]byte(userJSON), &user); err != nil {
			return nil, fmt.Errorf("%w: invalid user json", ErrInvalidInitData)
		}
		result.User = &user
	}

	if result.User == nil {
		return nil, fmt.Errorf("%w: missing user", ErrInvalidInitData)
	}

	return result, nil
}
