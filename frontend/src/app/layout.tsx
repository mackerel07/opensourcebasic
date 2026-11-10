import type { Metadata, Viewport } from "next";
import { SiteHeader } from "./SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "공용 물품 반납 확인",
  description: "공용 물품을 관리하고 사진으로 반납 상태를 확인합니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <SiteHeader />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
