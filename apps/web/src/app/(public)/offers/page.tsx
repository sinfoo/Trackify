import { ProgramsBrowser } from "@/features/public/offers";

export const metadata = { title: "Programs" };

export default function Page() {
  return (
    <div className="anim-rise mx-auto w-full max-w-[1180px] px-6 pt-12 pb-[72px]">
      <p className="eyebrow font-extrabold text-brand-text">Programs</p>
      <h1 className="mt-1 text-[40px] leading-[1.1] font-extrabold tracking-[-.035em]">Every program, one honest checkout.</h1>
      <p className="mt-2.5 max-w-[640px] text-base text-t3">Prices are in TND and live on the server. The assistant can read them but never change them.</p>
      <ProgramsBrowser />
    </div>
  );
}
