import { Check, GitMerge, MessageCircle, Upload, UserPlus, type LucideProps } from "lucide-react";
const icons = { Check, GitMerge, MessageCircle, Upload, UserPlus };
export function IconPlaceholder({
  lucide = "MessageCircle",
  tabler: _tabler,
  hugeicons: _hugeicons,
  phosphor: _phosphor,
  remixicon: _remixicon,
  ...props
}: LucideProps & {
  lucide?: keyof typeof icons;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
}) {
  const Icon = icons[lucide];
  return <Icon {...props} />;
}
