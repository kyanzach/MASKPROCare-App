import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface DateInfo {
  date: string;
  available: boolean;
  status: 'full' | 'limited' | 'available';
  capacity?: number;
  booked?: number;
}

interface CalendarPickerProps {
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  availableDates: DateInfo[];
  loadingDates: boolean;
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPicker({
  selectedDate,
  onSelectDate,
  availableDates,
  loadingDates,
  calendarMonth,
  setCalendarMonth,
}: CalendarPickerProps) {
  const currentYear = calendarMonth.getFullYear();
  const currentMonth = calendarMonth.getMonth();

  const handlePrevMonth = () => {
    setCalendarMonth(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(new Date(currentYear, currentMonth + 1, 1));
  };

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    
    const days: ({ day: number; dateStr: string; isToday: boolean; isPast: boolean; isSunday: boolean; isAvailable: boolean; isLimited: boolean; isUnavailable: boolean; isSelected: boolean } | null)[] = [];
    
    // Empty cells for alignment
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    
    // Calendar days
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const dateInfo = availableDates.find(a => a.date === dateStr);
      const dayOfWeek = new Date(year, month, d).getDay();
      const isSunday = dayOfWeek === 0;
      
      const isPast = dateStr < todayStr;
      const isToday = dateStr === todayStr;
      
      // Matches web: isAvailable = dateInfo.available (if it exists) or (!isSunday && dateStr >= todayStr)
      let isAvailable = false;
      let isLimited = false;
      let isUnavailable = false;
      
      if (dateInfo) {
        isAvailable = dateInfo.available;
        isLimited = dateInfo.status === 'limited';
        isUnavailable = dateInfo.status === 'full';
      } else {
        isAvailable = !isSunday && !isPast;
      }
      
      days.push({
        day: d,
        dateStr,
        isToday,
        isPast,
        isSunday,
        isAvailable,
        isLimited,
        isUnavailable,
        isSelected: selectedDate === dateStr,
      });
    }
    
    return days;
  }, [calendarMonth, availableDates, selectedDate]);

  return (
    <View style={styles.container}>
      {/* Month Navigator */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
          <FontAwesome name="chevron-left" size={14} color="#4b5563" />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {MONTHS[currentMonth]} {currentYear}
        </Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <FontAwesome name="chevron-right" size={14} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {/* Weekday headers */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((day, idx) => (
          <Text key={day} style={[styles.weekdayText, idx === 0 && styles.sundayText]}>
            {day}
          </Text>
        ))}
      </View>

      {/* Days Grid */}
      {loadingDates ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="small" color="#4f46e5" />
          <Text style={styles.loaderText}>Checking availability...</Text>
        </View>
      ) : (
        <View style={styles.daysGrid}>
          {calendarDays.map((dayInfo, index) => {
            if (!dayInfo) {
              return <View key={`empty-${index}`} style={styles.dayCellPlaceholder} />;
            }

            const { day, dateStr, isToday, isPast, isSunday, isAvailable, isLimited, isUnavailable, isSelected } = dayInfo;
            const disabled = isPast || isSunday || isUnavailable;

            // Determine status styles
            let statusCellStyle = null;
            let statusTextStyle = null;

            if (isSelected) {
              statusCellStyle = styles.selectedDayCell;
              statusTextStyle = styles.selectedDayText;
            } else if (isPast) {
              statusCellStyle = styles.disabledDayCell;
              statusTextStyle = styles.disabledDayText;
            } else if (isSunday) {
              statusCellStyle = styles.disabledDayCell;
              statusTextStyle = styles.sundayDayText;
            } else if (isUnavailable) {
              statusCellStyle = styles.fullDayCell;
              statusTextStyle = styles.fullDayText;
            } else if (isLimited) {
              statusCellStyle = styles.limitedDayCell;
              statusTextStyle = styles.limitedDayText;
            } else if (isAvailable) {
              statusCellStyle = styles.availableDayCell;
              statusTextStyle = styles.availableDayText;
            }

            return (
              <TouchableOpacity
                key={dateStr}
                disabled={disabled}
                onPress={() => onSelectDate(dateStr)}
                activeOpacity={0.7}
                style={[
                  styles.dayCell,
                  statusCellStyle,
                  isToday && !isSelected && styles.todayDayCell,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    statusTextStyle,
                    isToday && !isSelected && styles.todayDayText,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Calendar Legend */}
      <View style={styles.legend}>
        <View style={styles.legendBadgeContainer}>
          <View style={[styles.legendBadge, styles.legendBadgeAvailable]}>
            <View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} />
            <Text style={[styles.legendText, { color: '#15803d' }]}>Available</Text>
          </View>
          <View style={[styles.legendBadge, styles.legendBadgeLimited]}>
            <View style={[styles.legendDot, { backgroundColor: '#d97706' }]} />
            <Text style={[styles.legendText, { color: '#b45309' }]}>Almost Full</Text>
          </View>
          <View style={[styles.legendBadge, styles.legendBadgeFull]}>
            <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
            <Text style={[styles.legendText, { color: '#b91c1c' }]}>Full</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  sundayText: {
    color: '#ef4444',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellPlaceholder: {
    width: '14.28%',
    height: 46,
  },
  dayCell: {
    width: '13.8%',
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginVertical: 3,
    marginHorizontal: '0.24%',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  availableDayCell: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  limitedDayCell: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
  },
  fullDayCell: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  selectedDayCell: {
    backgroundColor: '#4f46e5',
    borderColor: '#4338ca',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  todayDayCell: {
    borderWidth: 2,
    borderColor: '#4f46e5',
  },
  disabledDayCell: {
    backgroundColor: '#f9fafb',
    borderColor: '#f3f4f6',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  availableDayText: {
    color: '#15803d',
    fontWeight: '700',
  },
  limitedDayText: {
    color: '#b45309',
    fontWeight: '700',
  },
  fullDayText: {
    color: '#b91c1c',
    fontWeight: '700',
    textDecorationLine: 'line-through',
  },
  selectedDayText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  todayDayText: {
    fontWeight: '800',
  },
  disabledDayText: {
    color: '#d1d5db',
    fontWeight: '400',
  },
  sundayDayText: {
    color: '#f87171',
    fontWeight: '500',
  },
  loaderContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  legend: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  legendBadgeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  legendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  legendBadgeAvailable: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  legendBadgeLimited: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
  },
  legendBadgeFull: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
