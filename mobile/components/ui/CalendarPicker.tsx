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

            return (
              <TouchableOpacity
                key={dateStr}
                disabled={disabled}
                onPress={() => onSelectDate(dateStr)}
                style={[
                  styles.dayCell,
                  isSelected && styles.selectedDayCell,
                  isToday && !isSelected && styles.todayDayCell,
                  disabled && styles.disabledDayCell,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isSelected && styles.selectedDayText,
                    isToday && !isSelected && styles.todayDayText,
                    disabled && styles.disabledDayText,
                  ]}
                >
                  {day}
                </Text>
                
                {/* Availability Dots */}
                {!isPast && !isSunday ? (
                  <View style={styles.dotContainer}>
                    {isUnavailable ? (
                      <View style={[styles.dot, styles.dotFull]} />
                    ) : isLimited ? (
                      <View style={[styles.dot, styles.dotLimited]} />
                    ) : isAvailable ? (
                      <View style={[styles.dot, styles.dotAvailable]} />
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Calendar Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotAvailable]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotLimited]} />
          <Text style={styles.legendText}>Almost Full</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotFull]} />
          <Text style={styles.legendText}>Full</Text>
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
    height: 48,
  },
  dayCell: {
    width: '14.28%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  selectedDayCell: {
    backgroundColor: '#4f46e5',
  },
  todayDayCell: {
    borderWidth: 1,
    borderColor: '#4f46e5',
  },
  disabledDayCell: {
    backgroundColor: '#f9fafb',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  selectedDayText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  todayDayText: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  disabledDayText: {
    color: '#d1d5db',
  },
  dotContainer: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotAvailable: {
    backgroundColor: '#10b981',
  },
  dotLimited: {
    backgroundColor: '#f59e0b',
  },
  dotFull: {
    backgroundColor: '#ef4444',
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
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#4b5563',
    fontWeight: '500',
  },
});
