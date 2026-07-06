package ton

import (
	"testing"

	"github.com/xssnick/tonutils-go/ton/wallet"
)

func TestVersionCandidatesIncludesV5R1Fallback(t *testing.T) {
	found := false
	for _, ver := range versionCandidates("V3R2") {
		if _, ok := ver.(wallet.ConfigV5R1Final); ok {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected V5R1 fallback candidate")
	}
}

func TestVersionCandidatesNotEmpty(t *testing.T) {
	if len(versionCandidates("V4R2")) == 0 {
		t.Fatal("expected version candidates")
	}
}
