import { Settings } from "lucide-react";

export function SetupHeader() {
  return (
    <div className="mb-6">
      <Settings className="w-10 h-10 text-line-green mb-4" aria-hidden />
      <h1 className="text-xl font-bold text-text-primary mb-1">ตั้งค่าระบบครั้งแรก</h1>
      <p className="text-sm text-text-secondary">
        ตั้งค่าโรงเรียน AI และผู้ดูแลระบบ
      </p>
    </div>
  );
}
