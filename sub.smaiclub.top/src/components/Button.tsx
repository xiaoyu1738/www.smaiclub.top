import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'ghost' | 'danger';
  icon?: ReactNode;
}

export default function Button({ tone = 'primary', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button-${tone} ${className}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
