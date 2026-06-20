import { useTheme } from 'next-themes';
import { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

interface UsagePieProps {
  systemUsage: number;
  processUsage: number;
  title: string;
}

export function UsagePie({ systemUsage, processUsage, title }: UsagePieProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const rawSystem = Math.max(systemUsage || 0, 0);
  const rawProcess = Math.max(processUsage || 0, 0);
  const cleanSystem = Math.min(Math.max(rawSystem, rawProcess), 100);
  const cleanProcess = Math.min(rawProcess, cleanSystem);

  const size = 100;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const colors = {
    system: isDark ? '#EA7D9B' : '#EF8664',
    process: '#D33FF0',
    track: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
  };

  const systemDash = useMemo(() => {
    return `${(cleanSystem / 100) * circumference} ${circumference}`;
  }, [cleanSystem, circumference]);

  const processDash = useMemo(() => {
    return `${(cleanProcess / 100) * circumference} ${circumference}`;
  }, [cleanProcess, circumference]);

  const otherUsage = Math.max(cleanSystem - cleanProcess, 0);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='relative w-24 h-24 flex items-center justify-center cursor-pointer'>
          <svg
            className='w-full h-full -rotate-90'
            viewBox={`0 0 ${size} ${size}`}
          >
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill='none'
              stroke={colors.track}
              strokeWidth={strokeWidth}
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill='none'
              stroke={colors.system}
              strokeWidth={strokeWidth}
              strokeLinecap='round'
              strokeDasharray={systemDash}
              className='transition-all duration-700 ease-out'
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill='none'
              stroke={colors.process}
              strokeWidth={strokeWidth}
              strokeLinecap='round'
              strokeDasharray={processDash}
              className='transition-all duration-700 ease-out'
            />
          </svg>
          <div className='absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none'>
            <div className='flex items-baseline gap-0.5'>
              <span className='text-xl font-bold font-mono tracking-tight text-default-900 dark:text-white'>
                {Math.round(cleanSystem)}
              </span>
              <span className='text-[10px] font-bold text-default-400 dark:text-default-500'>%</span>
            </div>
            <span className='text-[9px] font-medium opacity-70 text-default-500 dark:text-default-400'>
              {title}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side='top'>
        <div className='flex flex-col gap-1 text-xs'>
          <div className='flex items-center gap-2'>
            <span className='w-2 h-2 rounded-full' style={{ backgroundColor: colors.process }} />
            <span>进程: {cleanProcess.toFixed(1)}%</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='w-2 h-2 rounded-full' style={{ backgroundColor: colors.system }} />
            <span>其他: {otherUsage.toFixed(1)}%</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='w-2 h-2 rounded-full' style={{ backgroundColor: colors.track }} />
            <span>空闲: {(100 - cleanSystem).toFixed(1)}%</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
