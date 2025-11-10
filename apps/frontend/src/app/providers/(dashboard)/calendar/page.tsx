// apps/frontend/src/app/providers/(dashboard)/calendar/page.tsx

'use client';

import { useState } from 'react';

export default function ProviderCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [workingHours, setWorkingHours] = useState({
    monday: { enabled: true, start: '09:00', end: '17:00' },
    tuesday: { enabled: true, start: '09:00', end: '17:00' },
    wednesday: { enabled: true, start: '09:00', end: '17:00' },
    thursday: { enabled: true, start: '09:00', end: '17:00' },
    friday: { enabled: true, start: '09:00', end: '17:00' },
    saturday: { enabled: false, start: '09:00', end: '13:00' },
    sunday: { enabled: false, start: '09:00', end: '13:00' },
  });

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Calendar & Availability</h1>
        <p className="mt-2 text-gray-600">Set your working hours and manage blocked dates</p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">November 2025</h2>
            <div className="flex space-x-2">
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center py-2 text-sm font-medium text-gray-600">
                {day}
              </div>
            ))}
            {Array.from({ length: 35 }, (_, i) => {
              const day = i - 5; // Adjust for calendar alignment
              const isToday = day === 10;
              const hasBooking = [12, 15, 18].includes(day);
              const isBlocked = [20, 21].includes(day);

              return (
                <div
                  key={i}
                  className={`
                    aspect-square p-2 text-center border rounded-md cursor-pointer transition-colors
                    ${day < 1 || day > 30 ? 'bg-gray-50 text-gray-400' : 'hover:bg-blue-50'}
                    ${isToday ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                    ${hasBooking ? 'bg-green-50 border-green-500' : 'border-gray-200'}
                    ${isBlocked ? 'bg-red-50 border-red-500' : ''}
                  `}
                >
                  {day > 0 && day <= 30 && (
                    <div>
                      <div className="text-sm font-medium">{day}</div>
                      {hasBooking && (
                        <div className="mt-1 w-1 h-1 bg-green-600 rounded-full mx-auto"></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center justify-center space-x-6 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-50 border-2 border-green-500 rounded mr-2"></div>
              <span className="text-gray-600">Has Booking</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-50 border-2 border-red-500 rounded mr-2"></div>
              <span className="text-gray-600">Blocked</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-blue-600 rounded mr-2"></div>
              <span className="text-gray-600">Today</span>
            </div>
          </div>

          {/* Block Date Button */}
          <div className="mt-6 text-center">
            <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Block Selected Dates
            </button>
          </div>
        </div>

        {/* Working Hours */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Working Hours</h2>
          <div className="space-y-4">
            {daysOfWeek.map((day, index) => {
              const dayKey = day.toLowerCase() as keyof typeof workingHours;
              const hours = workingHours[dayKey];
              
              return (
                <div key={day} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={hours.enabled}
                      onChange={(e) => {
                        setWorkingHours({
                          ...workingHours,
                          [dayKey]: { ...hours, enabled: e.target.checked },
                        });
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-900 w-20">{day.slice(0, 3)}</span>
                  </div>
                  
                  {hours.enabled ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="time"
                        value={hours.start}
                        onChange={(e) => {
                          setWorkingHours({
                            ...workingHours,
                            [dayKey]: { ...hours, start: e.target.value },
                          });
                        }}
                        className="text-xs border-gray-300 rounded-md"
                      />
                      <span className="text-gray-500">-</span>
                      <input
                        type="time"
                        value={hours.end}
                        onChange={(e) => {
                          setWorkingHours({
                            ...workingHours,
                            [dayKey]: { ...hours, end: e.target.value },
                          });
                        }}
                        className="text-xs border-gray-300 rounded-md"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <button className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              Save Working Hours
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming Bookings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Bookings</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Home Inspection</p>
              <p className="text-xs text-gray-500">Nov 12, 2025 at 2:00 PM</p>
            </div>
            <span className="text-sm text-blue-600 font-medium">View Details →</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Minor Repairs</p>
              <p className="text-xs text-gray-500">Nov 15, 2025 at 10:00 AM</p>
            </div>
            <span className="text-sm text-blue-600 font-medium">View Details →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
