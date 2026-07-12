const PEOPLE = ['Homeowner', 'Inspector', 'Contractor', 'Insurance', 'Utility', 'Realtor', 'Buyer'];
export default function ConnectedEcosystem() {
  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-semibold text-brand-700">A shared history changes every relationship</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">One connected home. An entire ecosystem.</h2>

        <div className="mt-7 overflow-x-auto pb-2">
          <div className="mx-auto flex min-w-max items-center justify-center gap-2" aria-label="People connected through one permanent home record">
            {PEOPLE.map((person, index) => (
              <div key={person} className="contents">
                <span className={`rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm ${index === 0 || index === PEOPLE.length - 1 ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700'}`}>{person}</span>
                {index < PEOPLE.length - 1 ? <span className="text-brand-400" aria-hidden="true">↔</span> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
          <p className="mb-0 text-[11px] font-semibold text-brand-700">SHARED HOME HISTORY</p>
          <p className="mb-0 mt-1 text-sm font-semibold text-slate-900">Records · context · relationships · continuity</p>
        </div>

      </div>
    </section>
  );
}
