import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useHealthCheck,
  signup,
  useSignup,
  login,
  useLogin,
  getCurrentUser,
  useGetCurrentUser,
  mpesaStk,
  useMpesaStk,
  mpesaStatus,
  useMpesaStatus,
} from '@/api-client/src/generated/api';
import type { SignupRequest, LoginRequest, AuthResponse, User, MpesaStkRequest, MpesaStkResponse, MpesaPayment, MpesaStatusParams } from '@/api-client/src/generated/api.schemas';
import { setAuthTokenGetter } from '@/api-client/src/custom-fetch';
import { useAuth } from '@/context/AuthContext';
import { customFetch } from '@/api-client/src/custom-fetch';
import type { ApiError } from '@/api-client/src/custom-fetch';
import { API_BASE_URL } from '@/config';

const BASE_URL = API_BASE_URL;

export function useApiHealth() {
  return useHealthCheck();
}

export function useApiSignup() {
  const { currentUser } = useAuth();
  const mutation = useSignup();
  return mutation;
}

export function useApiLogin() {
  return useLogin();
}

export function useApiCurrentUser() {
  const { accessToken } = useAuth();

  const queryOptions = useGetCurrentUser();
  if (!accessToken) {
    return { ...queryOptions, data: undefined, isFetching: false } as typeof queryOptions;
  }
  return queryOptions;
}

export function useApiMpesaStk() {
  return useMpesaStk();
}

export function useApiMpesaStatus(params: MpesaStatusParams) {
  return useMpesaStatus(params);
}

export function useApiDashboardStats() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/admin/stats`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response;
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 60000,
  });
}

export function useApiCustomers() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/customers`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response?.customers || [];
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 30000,
  });
}

export function useApiUsers() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/users`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response?.users || [];
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 30000,
  });
}

export function useApiCreateCustomer() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useApiInquiries() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['inquiries'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/inquiries`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response?.inquiries || [];
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 30000,
  });
}

export function useApiCreateInquiry() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] });
    },
  });
}

export function useApiLoanApplications() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['loanApplications'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/loans`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response?.loans || [];
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 30000,
  });
}

export function useApiLoanRepayments() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['loanRepayments'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/loans`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response?.loans || [];
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 30000,
  });
}

export function useApiChartData() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['chartData'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const [applicationsRes, repaymentsRes] = await Promise.all([
        customFetch<any>(`${BASE_URL}/api/loans`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        customFetch<any>(`${BASE_URL}/api/admin/reports/monthly`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      const applications = (applicationsRes as any)?.loans || [];
      const report = repaymentsRes as any;
      const transactions = report?.transactions || [];
      return {
        applications,
        repayments: transactions,
        loanTypes: [
          { label: 'Starter', value: applications.filter((l: any) => l.loanType === 'Starter').length },
          { label: 'Top-up', value: applications.filter((l: any) => l.loanType === 'Top-up').length },
        ],
      };
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 60000,
  });
}

export function useApiUpdateLoanStatus() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      if (!accessToken) throw new Error('No access token');
      const body: Record<string, unknown> = {};
      if (reason) body.reason = reason;
      body.status = status;
      const response = await customFetch<any>(`${BASE_URL}/api/loans/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      return response;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['loanApplications'] });
      const previousLoans = qc.getQueryData(['loanApplications']);
      qc.setQueryData(['loanApplications'], (old: any) => {
        if (!old?.loans) return old;
        return {
          ...old,
          loans: old.loans.map((loan: any) =>
            loan.id === id ? { ...loan, status } : loan
          ),
        };
      });
      return { previousLoans };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLoans) {
        qc.setQueryData(['loanApplications'], context.previousLoans);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['loanApplications'] });
      qc.invalidateQueries({ queryKey: ['loanRepayments'] });
      qc.invalidateQueries({ queryKey: ['chartData'] });
      qc.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });
}

export function useApiForgotPassword() {
  return useMutation({
    mutationFn: async ({ mode, target }: { mode: 'email' | 'phone'; target: string }) => {
      const body: Record<string, unknown> = {};
      if (mode === 'email') body.email = target;
      else body.phone = target;
      const response = await customFetch<any>(`${BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response;
    },
  });
}

export function useApiResetPassword() {
  return useMutation({
    mutationFn: async ({ mode, target, code, newPassword }: { mode: 'email' | 'phone'; target: string; code: string; newPassword: string }) => {
      const body: Record<string, unknown> = { code, newPassword };
      if (mode === 'email') body.email = target;
      else body.phone = target;
      const response = await customFetch<any>(`${BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response;
    },
  });
}

export function useApiMyLoanInfo() {
  const { accessToken, currentUser } = useAuth();
  return useQuery({
    queryKey: ['myLoanInfo'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      const response = await customFetch<any>(`${BASE_URL}/api/loans/my-info`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response;
    },
    enabled: !!accessToken && !!currentUser,
    staleTime: 30000,
  });
}
