// apps/frontend/src/app/(dashboard)/dashboard/components/WelcomeSection.tsx

interface WelcomeSectionProps {
    userName: string;
  }
  
  export function WelcomeSection({ userName }: WelcomeSectionProps) {
    return (
      <div className="bg-gradient-to-r from-blue-50 via-white to-indigo-50 rounded-2xl p-6 border-2 border-blue-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xl" aria-hidden="true">👋</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {userName || 'Guest'}!
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Your property intelligence dashboard
            </p>
          </div>
        </div>
      </div>
    );
  }