package gifts

import "strings"

type marketQuote struct {
	ton    float64
	source string
}

func pickMinQuote(quotes ...marketQuote) (float64, string, bool) {
	var best float64
	var source string
	for _, q := range quotes {
		if q.ton <= 0 {
			continue
		}
		if best == 0 || q.ton < best {
			best = q.ton
			source = q.source
		}
	}
	if best > 0 {
		return best, source, true
	}
	return 0, "", false
}

func collectionDisplayName(slug string) string {
	if slug == "" {
		return ""
	}
	var b strings.Builder
	for i, r := range slug {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteByte(' ')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func appendUniqueWarning(warnings []string, msg string) []string {
	for _, existing := range warnings {
		if existing == msg {
			return warnings
		}
	}
	return append(warnings, msg)
}
