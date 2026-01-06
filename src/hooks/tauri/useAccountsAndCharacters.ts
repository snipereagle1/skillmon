import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addCharacterToAccount,
  createAccount,
  deleteAccount,
  getAccountsAndCharacters,
  removeCharacterFromAccount,
  reorderAccounts,
  reorderCharactersInAccount,
  reorderUnassignedCharacters,
  updateAccountName,
} from '@/generated/commands';
import type {
  AccountsAndCharactersResponse,
  AddCharacterToAccountParams,
  CreateAccountParams,
  DeleteAccountParams,
  RemoveCharacterFromAccountParams,
  ReorderAccountsParams,
  ReorderCharactersInAccountParams,
  ReorderUnassignedCharactersParams,
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

export function useReorderAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderAccountsParams) => {
      return await reorderAccounts(params);
    },
    onMutate: async (params) => {
      const previousData =
        queryClient.getQueryData<AccountsAndCharactersResponse>([
          'accountsAndCharacters',
        ]);

      if (previousData) {
        queryClient.setQueryData<AccountsAndCharactersResponse>(
          ['accountsAndCharacters'],
          (old) => {
            if (!old) return old;
            const accountIds = params.accountIds;
            const newAccounts = [...old.accounts].sort((a, b) => {
              const aIndex = accountIds.indexOf(a.id);
              const bIndex = accountIds.indexOf(b.id);
              return aIndex - bIndex;
            });
            return { ...old, accounts: newAccounts };
          }
        );
      }

      await queryClient.cancelQueries({ queryKey: ['accountsAndCharacters'] });

      return { previousData };
    },
    onError: (_err, _newOrder, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['accountsAndCharacters'],
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}

export function useReorderCharactersInAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderCharactersInAccountParams) => {
      return await reorderCharactersInAccount(params);
    },
    onMutate: async (params) => {
      const previousData =
        queryClient.getQueryData<AccountsAndCharactersResponse>([
          'accountsAndCharacters',
        ]);

      if (previousData) {
        queryClient.setQueryData<AccountsAndCharactersResponse>(
          ['accountsAndCharacters'],
          (old) => {
            if (!old) return old;
            const newAccounts = old.accounts.map((acc) => {
              if (acc.id === params.accountId) {
                const characterIds = params.characterIds;
                const newCharacters = [...acc.characters].sort((a, b) => {
                  const aIndex = characterIds.indexOf(a.character_id);
                  const bIndex = characterIds.indexOf(b.character_id);
                  return aIndex - bIndex;
                });
                return { ...acc, characters: newCharacters };
              }
              return acc;
            });
            return { ...old, accounts: newAccounts };
          }
        );
      }

      await queryClient.cancelQueries({ queryKey: ['accountsAndCharacters'] });

      return { previousData };
    },
    onError: (_err, _params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['accountsAndCharacters'],
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}

export function useReorderUnassignedCharacters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderUnassignedCharactersParams) => {
      return await reorderUnassignedCharacters(params);
    },
    onMutate: async (params) => {
      const previousData =
        queryClient.getQueryData<AccountsAndCharactersResponse>([
          'accountsAndCharacters',
        ]);

      if (previousData) {
        queryClient.setQueryData<AccountsAndCharactersResponse>(
          ['accountsAndCharacters'],
          (old) => {
            if (!old) return old;
            const characterIds = params.characterIds;
            const newUnassigned = [...old.unassigned_characters].sort(
              (a, b) => {
                const aIndex = characterIds.indexOf(a.character_id);
                const bIndex = characterIds.indexOf(b.character_id);
                return aIndex - bIndex;
              }
            );
            return { ...old, unassigned_characters: newUnassigned };
          }
        );
      }

      await queryClient.cancelQueries({ queryKey: ['accountsAndCharacters'] });

      return { previousData };
    },
    onError: (_err, _params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['accountsAndCharacters'],
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsAndCharacters'] });
    },
  });
}
