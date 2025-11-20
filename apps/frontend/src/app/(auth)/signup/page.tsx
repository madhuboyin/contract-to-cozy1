// apps/frontend/src/app/(auth)/signup/page.tsx

'use client';
import { useSearchParams, useRouter } from 'next/navigation'; // Import necessary hooks
import { ArrowRight } from 'lucide-react';
// Assuming form components, z-schema, and apiClient are imported...

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read the 'redirect' parameter, defaulting to the main dashboard page
  const redirectTo = searchParams.get('redirect') || '/dashboard/page'; 

  // --- Assuming an existing function or handler is here ---
  // Example of where the redirection logic must be placed:
  const onSignupSuccess = () => {
    // Perform registration tasks...
    
    // FINAL REDIRECTION STEP:
    router.push(redirectTo); 
  };
  // --------------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-full max-w-md space-y-8 p-10 bg-white rounded-xl shadow-2xl border border-stone-200">
        <div className="text-center">
          <h1 className="text-3xl font-serif font-bold text-amber-700">Create Your Free Account</h1>
          <p className="mt-2 text-stone-600">Join now to simplify your home journey.</p>
        </div>
        
        {/* Placeholder for actual Signup Form component/logic */}
        <div className="space-y-4">
          <p className="text-sm text-amber-700 font-semibold">
            Signup Form (Actual component logic should call onSignupSuccess)
          </p>
          <button 
            onClick={onSignupSuccess} // Simulate success for demonstration
            className="w-full bg-amber-700 text-white py-2.5 rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center"
          >
            Sign Up <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
        
        {/* Display redirect path for testing */}
        <p className="text-xs text-stone-500 text-center">
          Will redirect to: <span className="font-mono text-amber-700">{redirectTo}</span>
        </p>
      </div>
    </div>
  );
}