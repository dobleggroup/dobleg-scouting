/** Asterisco verde sutil que marca un campo obligatorio (mismo en todos los formularios). */
export default function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-brand-green/80 font-semibold">*</span>
      <span className="sr-only"> (obligatorio)</span>
    </>
  )
}
