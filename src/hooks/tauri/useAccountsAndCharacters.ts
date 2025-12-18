import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addCharacterToAccount,
  createAccount,
  deleteAccount,
  getAccountsAndCharacters,
  removeCharacterFromAccount,
  updateAccountName,
} from '@/generated/commands';
import type {
  AccountsAndCharactersResponse,
  AddCharacterToAccountParams,
  CreateAccountParams,
  DeleteAccountParams,
  RemoveCharacterFromAccountParams,
  UpdateAccountNameParams,
} from '@/generated/types';

export function useAccountsAndCharacters() {
  return useQuery<AccountsAndCharactersResponse>({
    queryKey: ['accountsAndCharacters'],
    queryFn: async () => {
      return await getAccountsAndCharacters();
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateAccountParams) => {
      return await createAccount(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}

export function useUpdateAccountName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateAccountNameParams) => {
      return await updateAccountName(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteAccountParams) => {
      return await deleteAccount(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}

export function useAddCharacterToAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddCharacterToAccountParams) => {
      return await addCharacterToAccount(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}

export function useRemoveCharacterFromAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RemoveCharacterFromAccountParams) => {
      return await removeCharacterFromAccount(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}
