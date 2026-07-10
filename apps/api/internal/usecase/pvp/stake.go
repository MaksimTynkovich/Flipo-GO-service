package pvp

const StakeToleranceBps = 1000 // ±10%

func StakeToleranceBounds(reference int64) (min, max int64) {
	if reference <= 0 {
		return 0, 0
	}
	min = reference * (10000 - StakeToleranceBps) / 10000
	max = reference * (10000 + StakeToleranceBps) / 10000
	return min, max
}

func StakeWithinTolerance(reference, actual int64) bool {
	if reference <= 0 || actual <= 0 {
		return false
	}
	min, max := StakeToleranceBounds(reference)
	return actual >= min && actual <= max
}
