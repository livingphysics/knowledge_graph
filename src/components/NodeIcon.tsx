import { HelpCircle, Lightbulb, FileText } from 'lucide-react';
import type { NodeType } from '@/lib/nodes';

interface Props {
  type: NodeType;
  className?: string;
  strokeWidth?: number;
}

export default function NodeIcon({ type, className, strokeWidth = 1.75 }: Props) {
  const Icon = type === 'question' ? HelpCircle : type === 'thought' ? Lightbulb : FileText;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
