const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

interface Props {
  icon: string | null;
  className?: string;
}

export default function CategoryIcon({ icon, className = '' }: Props) {
  if (!icon) return <span className={className}>📁</span>;
  const isImage = /\.(png|jpe?g|gif|svg|webp)$/i.test(icon);
  if (isImage) {
    const src = icon.startsWith('http') ? icon : `${BASE}/knowledge/categories/icons/${icon}`;
    return <img src={src} alt="" className={`inline-block w-4 h-4 rounded object-cover ${className}`} />;
  }
  return <span className={className}>{icon}</span>;
}
