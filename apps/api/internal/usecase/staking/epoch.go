package staking

import "time"

var moscowLocation *time.Location

func init() {
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		moscowLocation = time.FixedZone("MSK", 3*60*60)
		return
	}
	moscowLocation = loc
}

func MoscowLocation() *time.Location {
	return moscowLocation
}

// legacyEpochMaxDuration marks weekly epochs from before the daily staking redesign.
const legacyEpochMaxDuration = 25 * time.Hour

// CurrentEpochBounds returns [start, end) for the current calendar day in MSK.
func CurrentEpochBounds(now time.Time) (time.Time, time.Time) {
	m := now.In(moscowLocation)
	start := time.Date(m.Year(), m.Month(), m.Day(), 0, 0, 0, 0, moscowLocation)
	end := start.AddDate(0, 0, 1)
	return start.UTC(), end.UTC()
}

func IsEpochEnded(epochEndsAt time.Time, now time.Time) bool {
	return !now.Before(epochEndsAt)
}

func isLegacyEpoch(startsAt, endsAt time.Time) bool {
	return endsAt.Sub(startsAt) > legacyEpochMaxDuration
}
