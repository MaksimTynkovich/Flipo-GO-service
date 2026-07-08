package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	tgclient "github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/auth"
	"github.com/gotd/td/tg"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	flipotg "github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func main() {
	config.LoadDotEnv()

	appID := flipotg.ParseTelegramAppID(os.Getenv("TELEGRAM_API_ID"))
	appHash := os.Getenv("TELEGRAM_API_HASH")
	sessionPath := os.Getenv("TELEGRAM_SESSION_PATH")
	if sessionPath == "" {
		sessionPath = "data/telegram/session.json"
	}
	phone := os.Getenv("TELEGRAM_PHONE")

	if appID == 0 || appHash == "" {
		fmt.Fprintln(os.Stderr, "Set TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org/apps")
		os.Exit(1)
	}
	if phone == "" {
		fmt.Fprintln(os.Stderr, "Set TELEGRAM_PHONE in international format, e.g. +79991234567")
		os.Exit(1)
	}

	if err := os.MkdirAll(filepath.Dir(sessionPath), 0o700); err != nil {
		fmt.Fprintf(os.Stderr, "create session dir: %v\n", err)
		os.Exit(1)
	}

	reader := bufio.NewReader(os.Stdin)
	flow := auth.NewFlow(terminalAuth{phone: phone, reader: reader}, auth.SendCodeOptions{})

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	client := tgclient.NewClient(appID, appHash, tgclient.Options{
		SessionStorage: &tgclient.FileSessionStorage{Path: sessionPath},
	})

	fmt.Printf("Logging in as %s\nSession: %s\n", phone, sessionPath)
	err := client.Run(ctx, func(ctx context.Context) error {
		if err := client.Auth().IfNecessary(ctx, flow); err != nil {
			return err
		}

		self, err := client.Self(ctx)
		if err != nil {
			return err
		}

		name := self.FirstName
		if self.Username != "" {
			name += " (@" + self.Username + ")"
		}
		fmt.Printf("Authorized as %s [id=%d]\n", name, self.ID)
		fmt.Println("Session saved. Restart the API server to use gift scanning.")
		return nil
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "auth failed: %v\n", err)
		os.Exit(1)
	}
}

type terminalAuth struct {
	phone  string
	reader *bufio.Reader
}

func (t terminalAuth) Phone(_ context.Context) (string, error) {
	return t.phone, nil
}

func (t terminalAuth) Password(_ context.Context) (string, error) {
	fmt.Print("2FA password (leave empty if none): ")
	line, err := t.reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func (t terminalAuth) Code(_ context.Context, sentCode *tg.AuthSentCode) (string, error) {
	_ = sentCode
	fmt.Print("Login code from Telegram: ")
	line, err := t.reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func (t terminalAuth) AcceptTermsOfService(_ context.Context, tos tg.HelpTermsOfService) error {
	fmt.Println("Accept Telegram Terms of Service:", tos.Text)
	return nil
}

func (t terminalAuth) SignUp(_ context.Context) (auth.UserInfo, error) {
	fmt.Print("First name: ")
	first, _ := t.reader.ReadString('\n')
	fmt.Print("Last name: ")
	last, _ := t.reader.ReadString('\n')
	return auth.UserInfo{
		FirstName: strings.TrimSpace(first),
		LastName:  strings.TrimSpace(last),
	}, nil
}
