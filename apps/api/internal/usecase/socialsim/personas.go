package socialsim

import (
	"fmt"

	"github.com/google/uuid"
)

const personaNamespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8" // DNS namespace UUID

type Persona struct {
	ID         uuid.UUID
	TelegramID int64
	FirstName  string
	Username   string
	PhotoURL   string
}

var firstNames = []string{
	"Alex", "Mia", "Leo", "Nina", "Max", "Lara", "Ivan", "Kate", "Omar", "Sofia",
	"Dan", "Vera", "Nik", "Anya", "Sam", "Lina", "Art", "Eva", "Tim", "Rita",
	"Kir", "Yana", "Joe", "Mila", "Ron", "Zara", "Pavel", "Olga", "Mark", "Ira",
	"Ted", "Alina", "Ben", "Dasha", "Chris", "Polina", "Erik", "Nastya", "Felix", "Tanya",
	"Hugo", "Sveta", "Ian", "Liza", "Jake", "Nadya", "Kyle", "Marina", "Luke", "Asya",
	"Noah", "Inna", "Owen", "Galya", "Ryan", "Zhanna", "Seth", "Oksana", "Vince", "Lera",
	"Wade", "Diana", "Zack", "Elena", "Adam", "Irina", "Brad", "Julia", "Carl", "Karina",
	"Drew", "Lyuba", "Evan", "Masha", "Finn", "Natasha", "Greg", "Olya", "Hank", "Sonya",
	"Igor", "Valya", "Yuri", "Zhenya", "Boris", "Katya", "Denis", "Sasha", "Gleb", "Vika",
	"Roma", "Nastya", "Artem", "Dima", "Kostya", "Slava", "Tolya", "Vanya", "Zhenya", "Lesha",
}

var usernames = []string{
	"neonfox", "tonwave", "pixelbet", "luckyorbit", "softcrash", "greenspin", "nightchip",
	"vaultkid", "rocketbee", "quietace", "moonlane", "flipdash", "redcoil", "blacktide",
	"giftpulse", "stakeowl", "crashmint", "rouletter", "duelbyte", "hubspark", "coinmuse",
	"betnova", "spinlynx", "roomfox", "edgekite", "potflame", "cashorbit", "wingeton",
	"fairseed", "roundfox", "multibit", "colorace", "pvpride", "lobbybee", "chipnova",
	"tonlynx", "giftkite", "stakebee", "crashlynx", "spinowl", "duelfox", "hublynx",
	"betkite", "roombee", "edgeowl", "potlynx", "cashfox", "wingkite", "seedbee",
	"roundlynx", "multifox", "colorbee", "pvplynx", "lobbyowl", "chipfox", "tonbee",
	"giftlynx", "stakefox", "crashbee", "spinlyx", "duelowl", "hubfox", "betbee",
	"roomowl", "edgefox", "potbee", "cashlynx", "wingowl", "seedfox", "roundbee",
	"multilynx", "colorfox", "pvpbee", "lobbylynx", "chipowl", "tonfox", "giftbee",
	"stakelynx", "crashowl", "spinfox", "duelbee", "hubowl", "betlynx", "roomfox2",
	"edgebee", "potowl", "cashbee", "wingfox", "seedlynx", "roundowl", "multibee",
	"colorlynx", "pvpowl", "lobbyfox", "chipbee", "tonowl", "giftfox2", "stakespin",
	"crashspin", "rouletton", "duelton", "hubton", "betton", "roomton", "edgeton",
}

func buildPersonas(n int) []Persona {
	if n < 80 {
		n = 80
	}
	if n > 150 {
		n = 150
	}
	ns := uuid.MustParse(personaNamespace)
	out := make([]Persona, 0, n)
	for i := 0; i < n; i++ {
		slug := fmt.Sprintf("social-sim-persona-%03d", i)
		id := uuid.NewSHA1(ns, []byte(slug))
		name := firstNames[i%len(firstNames)]
		user := usernames[i%len(usernames)]
		if i >= len(usernames) {
			user = fmt.Sprintf("%s%d", user, i/len(usernames)+1)
		}
		photo := fmt.Sprintf("https://api.dicebear.com/7.x/thumbs/svg?seed=%s", slug)
		out = append(out, Persona{
			ID:         id,
			TelegramID: -1000 - int64(i), // reserved negative IDs for social bots
			FirstName:  name,
			Username:   user,
			PhotoURL:   photo,
		})
	}
	return out
}
