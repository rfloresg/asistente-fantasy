"use client";

// Formulario de filtros que se aplica solo al cambiar un desplegable (en el móvil, sin tener que pulsar Filtrar)
export default function AutoForm({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <form className={className} onChange={(e) => e.currentTarget.requestSubmit()}>
      {children}
    </form>
  );
}
