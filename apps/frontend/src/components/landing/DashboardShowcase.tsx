import Link from 'next/link';

export default function DashboardShowcase() {
  return (
    // Reduced vertical padding
    <section id="features" className="py-10 md:py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          
          {/* Left Column - Text (Sleeker fonts, tighter spacing) */}
          <div>
            <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full mb-3">
              Your home, connected
            </div>
            
            {/* Reduced font size and margin */}
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              The control center for your home&apos;s memory
            </h2>
            
            {/* Reduced font size and margin */}
            {/* Reduced button size */}
            <Link
              href="/signup"
              className="mt-3 inline-block px-5 py-2.5 bg-blue-600 text-white text-base font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md"
            >
              Explore your home →
            </Link>
          </div>

          {/* Right Column - Dashboard Mockup (desktop only; too dense to read at mobile widths) */}
          <div className="relative hidden lg:block">
            {/* Reduced outer padding (p-8 to p-6) */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 shadow-xl border border-gray-200">
              <div className="overflow-hidden rounded-xl bg-white shadow-lg">
                <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
                  <div>
                    <p className="text-[10px] text-blue-100">MY HOME</p>
                    <h3 className="text-base font-semibold">14 Maple Street</h3>
                  </div>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-medium">Connected since 2026</span>
                </div>

                <div className="grid grid-cols-[132px_1fr]">
                  <nav className="border-r border-slate-200 bg-slate-50 p-3" aria-label="Home system preview">
                    {['Overview', 'Vault', 'Timeline', 'Maintenance', 'Projects', 'Property Health', 'Finances', 'Insurance', 'Neighborhood', 'Savings', 'Seller Prep'].map((item, index) => (
                      <div key={item} className={`mb-0.5 rounded-md px-2 py-1.5 text-[10px] font-medium ${index === 0 ? 'bg-blue-100 text-blue-700' : 'text-slate-600'}`}>
                        {item}
                      </div>
                    ))}
                  </nav>

                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-medium text-slate-500">HOME MEMORY</p>
                        <h4 className="mt-0.5 text-sm font-semibold text-slate-900">Your home remembers.</h4>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">Health improving ↑</span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[['2042', 'Roof warranty'], ['98%', 'Buyer package'], ['$1.1k', 'Savings found']].map(([value, label]) => (
                        <div key={label} className="rounded-lg border border-slate-200 p-2">
                          <div className="text-sm font-bold text-blue-600">{value}</div>
                          <div className="text-[9px] text-slate-500">{label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <p className="text-[10px] font-semibold text-slate-900">Connected home history</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {[
                          ['Kitchen remodel', '18 photos · 2028'],
                          ['Insurance claim', 'Resolved · 2030'],
                          ['HVAC serviced', 'Next due Jun 2027'],
                          ['Contractor history', '7 trusted relationships'],
                        ].map(([title, detail]) => (
                          <div key={title} className="rounded-lg bg-slate-50 p-2">
                            <p className="text-[9px] font-medium text-slate-900">{title}</p>
                            <p className="text-[8px] text-slate-500">{detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative Elements (Unchanged) */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-200 rounded-full opacity-20 blur-2xl"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-200 rounded-full opacity-20 blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
