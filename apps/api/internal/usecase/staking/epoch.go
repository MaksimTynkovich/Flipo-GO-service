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

// CurrentEpochBounds returns [start, end) for the staking week in MSK (Mon 00:00 – next Mon 00:00).
func CurrentEpochBounds(now time.Time) (time.Time, time.Time) {
	m := now.In(moscowLocation)
	weekday := int(m.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	daysFromMonday := weekday - 1
	start := time.Date(m.Year(), m.Month(), m.Day(), 0, 0, 0, 0, moscowLocation).AddDate(0, 0, -daysFromMonday)
	end := start.AddDate(0, 0, 7)
	return start.UTC(), end.UTC()
}

func IsEpochEnded(epochEndsAt time.Time, now time.Time) bool {
	return !now.Before(epochEndsAt)
}
