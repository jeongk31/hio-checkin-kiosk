import './kiosk.css';

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="kiosk-app">
      <div className="kiosk-center-wrapper">
        {children}
      </div>
    </div>
  );
}
