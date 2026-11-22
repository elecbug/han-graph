package account

import (
	"fmt"
	"math/bits"
	"time"
	_ "time/tzdata" // The runtime image has no system timezone database.
)

// Intervals use Unix seconds with an exclusive end. A UTC day's bitset counts
// overlapping tabs, devices and retried submissions only once.
type ActivityInterval struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

type StudyDay struct {
	Date      string `json:"date"`
	Seconds   int    `json:"seconds"`
	Rounds    int    `json:"rounds"`
	Correct   int    `json:"correct"`
	Questions int    `json:"questions"`
}

const secondsPerDay = 24 * 60 * 60

func (s *Store) SaveActivity(id string, intervals []ActivityInterval) error {
	now := time.Now().Unix()
	if len(intervals) == 0 || len(intervals) > 64 {
		return ErrInvalid
	}
	days := make(map[string][]ActivityInterval)
	for _, span := range intervals {
		if span.Start < now-secondsPerDay || span.End > now+5 || span.End <= span.Start || span.End-span.Start > 180 {
			return ErrInvalid
		}
		for start := span.Start; start < span.End; {
			base := start - start%secondsPerDay
			end := min(span.End, base+secondsPerDay)
			day := time.Unix(base, 0).UTC().Format(time.DateOnly)
			days[day] = append(days[day], ActivityInterval{start - base, end - base})
			start = end
		}
	}
	return s.storage.saveActivity(s.ctx, id, days)
}

func addIntervals(old []byte, spans []ActivityInterval) ([]byte, error) {
	if len(old) != 0 && len(old) != secondsPerDay/8 {
		return nil, fmt.Errorf("invalid activity day size %d", len(old))
	}
	data := make([]byte, secondsPerDay/8)
	copy(data, old)
	for _, span := range spans {
		for i := span.Start; i < span.End; i++ {
			data[i/8] |= 1 << (i % 8)
		}
	}
	return data, nil
}

type studyMonth struct {
	start, end time.Time
	firstDate  time.Time // Calendar labels are advanced in UTC, independent of DST.
	bounds     []time.Time
}

func localDayStart(date time.Time, loc *time.Location) time.Time {
	label := date.Format(time.DateOnly)
	midnight := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)
	if midnight.Format(time.DateOnly) == label && midnight.Add(-time.Second).Format(time.DateOnly) < label {
		return midnight
	}
	// A timezone change can skip local midnight or even a whole calendar date.
	lo, hi := date.Unix()-secondsPerDay, date.Unix()+secondsPerDay
	for lo < hi {
		mid := lo + (hi-lo)/2
		if time.Unix(mid, 0).In(loc).Format(time.DateOnly) < label {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return time.Unix(lo, 0).In(loc)
}

func makeStudyMonth(month string, loc *time.Location, now time.Time) (studyMonth, error) {
	first, err := time.Parse("2006-01", month)
	today := now.In(loc)
	if err != nil || first.Year() < 1970 || month > today.Format("2006-01") {
		return studyMonth{}, ErrInvalid
	}
	last := first.AddDate(0, 1, 0)
	if month == today.Format("2006-01") {
		last = first.AddDate(0, 0, today.Day())
	}
	m := studyMonth{firstDate: first}
	for date := first; !date.After(last); date = date.AddDate(0, 0, 1) {
		m.bounds = append(m.bounds, localDayStart(date, loc))
	}
	m.start, m.end = m.bounds[0], m.bounds[len(m.bounds)-1]
	return m, nil
}

func (s *Store) MonthlyStudy(id, month, zone string) ([]StudyDay, error) {
	if zone == "" || zone == "Local" || len(zone) > 100 || len(month) != 7 {
		return nil, ErrInvalid
	}
	loc, err := time.LoadLocation(zone)
	if err != nil {
		return nil, ErrInvalid
	}
	m, err := makeStudyMonth(month, loc, time.Now())
	if err != nil {
		return nil, err
	}
	return s.storage.studyDays(s.ctx, id, m)
}

func (m studyMonth) days() []StudyDay {
	days := make([]StudyDay, len(m.bounds)-1)
	for i := range days {
		days[i].Date = m.firstDate.AddDate(0, 0, i).Format(time.DateOnly)
	}
	return days
}

func (m studyMonth) addUsage(days []StudyDay, utcDay string, data []byte) error {
	base, err := time.Parse(time.DateOnly, utcDay)
	if err != nil {
		return err
	}
	if len(data) != secondsPerDay/8 {
		return fmt.Errorf("invalid activity day size %d", len(data))
	}
	// Local calendar boundaries can be offset from UTC by a fractional hour
	// and a local day can contain 23 or 25 hours.
	for i := range days {
		start, next := m.bounds[i], m.bounds[i+1]
		lo := max(int64(0), start.Unix()-base.Unix())
		hi := min(int64(secondsPerDay), next.Unix()-base.Unix())
		for lo < hi {
			n := min(8-lo%8, hi-lo)
			mask := byte((1<<n)-1) << (lo % 8)
			days[i].Seconds += bits.OnesCount8(data[lo/8] & mask)
			lo += n
		}
	}
	return nil
}

func (m studyMonth) addRound(days []StudyDay, completed time.Time, correct, questions int) {
	day := &days[completed.In(m.start.Location()).Day()-1]
	day.Rounds++
	day.Correct += correct
	day.Questions += questions
}
