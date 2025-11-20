// apps/frontend/src/app/(auth)/login/page.tsx

'use client';
import { useSearchParams, useRouter } from 'next/navigation'; 
import { ArrowRight } from 'lucide-react';
// NOTE: Assuming your form/authentication logic exists here.

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Read the 'redirect' parameter, defaulting to the main dashboard page
  const redirectTo = searchParams.get('redirect') || '/dashboard/page'; 

  // --- PLACEHOLDER FOR AUTHENTICATION LOGIC ---
  const onLoginSuccess = () => {
    // In your actual implementation, this runs after a successful API call
    // and setting authentication state (e.g., storing a token).
    
    // FINAL REDIRECTION STEP:
    router.push(redirectTo); 
  };
  // -------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-full max-w-md space-y-8 p-10 bg-white rounded-xl shadow-2xl border border-stone-200">
        <div className="text-center">
          <h1 className="text-3xl font-serif font-bold text-stone-900">Welcome Back</h1>
          <p className="mt-2 text-stone-600">Sign in to access your checklist and dashboard.</p>
        </div>
        
        {/* Placeholder for actual Login Form component/logic */}
        <div className="space-y-4">
          <p className="text-sm text-amber-700 font-semibold">
            Login Form (Actual component logic should call onLoginSuccess)
          </p>
          <button 
            onClick={onLoginSuccess} // Simulate success for demonstration
            className="w-full bg-stone-900 text-white py-2.5 rounded-lg hover:bg-stone-800 transition-colors flex items-center justify-center"
          >
            Log In <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
        
        {/* Display redirect path for testing */}
        <p className="text-xs text-stone-500 text-center">
          Redirecting to: <span className="font-mono text-amber-700">{redirectTo}</span>
        </p>
      </div>
    </div>
  );
}