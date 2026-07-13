package giftimage

import "testing"

func TestValidGiftImageFile(t *testing.T) {
	valid := []string{
		"plushpepe-1984.medium.jpg",
		"TrappedHeart-18189.medium.jpg",
		"MoodPack-72457.medium.jpg",
	}
	for _, file := range valid {
		if !validGiftImageFile(file) {
			t.Fatalf("expected valid: %s", file)
		}
	}

	invalid := []string{
		"",
		"../etc/passwd",
		"evil/malicious.medium.jpg",
		"no-suffix.jpg",
		"TrappedHeart-18189.png",
	}
	for _, file := range invalid {
		if validGiftImageFile(file) {
			t.Fatalf("expected invalid: %s", file)
		}
	}
}

func TestSlugFromImageURL(t *testing.T) {
	got := SlugFromImageURL("https://nft.fragment.com/gift/TrappedHeart-18189.medium.jpg")
	if got != "TrappedHeart-18189" {
		t.Fatalf("got %q", got)
	}
}
