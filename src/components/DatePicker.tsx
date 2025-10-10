import React from 'react';

interface DatePickerProps {
  historicalDates: string[];
  selectedDate: string | null;
  onDateSelect: (date: string) => void;
  onClose: () => void;
  currentDate: string;
}

export default function DatePicker({ historicalDates, selectedDate, onDateSelect, onClose, currentDate }: DatePickerProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = React.useState(today);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isHistoricalDate = (date: Date) => {
    const dateStr = formatDate(date);
    return historicalDates.includes(dateStr);
  };

  const isToday = (date: Date) => {
    const dateStr = formatDate(date);
    return dateStr === currentDate;
  };

  const changeMonth = (increment: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + increment, 1));
  };

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <h3 className="text-xl font-bold text-white">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>

          <button
            onClick={() => changeMonth(1)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center text-gray-400 text-sm font-medium py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {getDaysInMonth(currentMonth).map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="h-8"></div>;
            }

            const dateStr = formatDate(day);
            const isHistorical = isHistoricalDate(day);
            const isCurrentDay = isToday(day);
            const isSelected = selectedDate === dateStr;
            const isPast = day < today && !isCurrentDay;

            return (
              <button
                key={dateStr}
                onClick={() => onDateSelect(dateStr)}
                disabled={day > today}
                className={`h-10 rounded-lg text-sm font-medium transition-all flex flex-col items-center justify-center ${
                  isCurrentDay
                    ? 'bg-blue-500 text-white'
                    : isSelected
                    ? 'bg-blue-600 text-white'
                    : isPast
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : day > today
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'bg-gray-600 text-white hover:bg-gray-500'
                }`}
              >
                {day.getDate()}
                {isHistorical && (
                  <div className="w-1 h-1 bg-blue-400 rounded-full mx-auto mt-1"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}