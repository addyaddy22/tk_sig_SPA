import { useQuery } from '@tanstack/react-query';
import { api, qs } from './api';
import type { AppConfig, DayAvailability, Service, Therapist } from './types';

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api<AppConfig>('/config'), staleTime: Infinity });

export const useServices = () => useQuery({ queryKey: ['services'], queryFn: () => api<Service[]>('/services') });

export const useTherapists = (serviceId?: string) =>
  useQuery({
    queryKey: ['therapists', serviceId ?? 'all'],
    queryFn: () => api<Therapist[]>(`/therapists${qs({ serviceId })}`),
  });

export const useAvailability = (serviceId: string | undefined, date: string, therapistId?: string) =>
  useQuery({
    queryKey: ['availability', serviceId, date, therapistId ?? 'any'],
    queryFn: () =>
      api<DayAvailability>(
        `/availability${qs({ serviceId, date, therapistId: therapistId === 'any' ? undefined : therapistId })}`,
      ),
    enabled: !!serviceId,
    // Availability changes as other people book - keep it fresh.
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
