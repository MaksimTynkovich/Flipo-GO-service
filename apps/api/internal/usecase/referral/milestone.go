package referral

import (
	"time"
)

const (
	refTypeDaily     = "referral_daily"
	refTypeGGR       = "referral_ggr"
	refTypeMilestone = "referral_milestone"
)

func monthStartMSK(now time.Time) time.Time {
	msk := time.FixedZone("MSK", 3*60*60)
	t := now.In(msk)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, msk).UTC()
}
