import './globals.css';

export const metadata = {
  title: 'Ops Dashboard',
  description: 'WhatsApp Ticket Ops Dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
