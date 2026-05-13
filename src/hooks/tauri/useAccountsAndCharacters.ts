import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { AccountsAndCharactersResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

interface CreateAccountParams {
  [key: string]: unknown;
  name: string;
}

interface UpdateAccountNameParams {
  [key: string]: unknown;
  accountId: number;
  name: string;
}

interface DeleteAccountParams {
  [key: string]: unknown;
  accountId: number;
}

interface AddCharacterToAccountParams {
  [key: string]: unknown;
  characterId: number;
  accountId: number;
}

interface RemoveCharacterFromAccountParams {
  [key: string]: unknown;
  characterId: number;
}

interface ReorderAccountsParams {
  [key: string]: unknown;
  accountIds: number[];
}

interface ReorderCharactersInAccountParams {
  [key: string]: unknown;
  accountId: number;
  characterIds: number[];
}

interface ReorderUnassignedCharactersParams {
  [key: string]: unknown;
  characterIds: number[];
}

export function useAccountsAndCharacters() {
  return useQuery<AccountsAndCharactersResponse>({
    queryKey: queryKeys.accountsAndCharacters(),
    queryFn: async () => {
      return await invoke<AccountsAndCharactersResponse>(
        'get_accounts_and_characters'
      );
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateAccountParams) => {
      return await invoke('create_account', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useUpdateAccountName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateAccountNameParams) => {
      return await invoke('update_account_name', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteAccountParams) => {
      return await invoke('delete_account', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useAddCharacterToAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddCharacterToAccountParams) => {
      return await invoke('add_character_to_account', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useRemoveCharacterFromAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RemoveCharacterFromAccountParams) => {
      return await invoke('remove_character_from_account', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useReorderAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderAccountsParams) => {
      return await invoke('reorder_accounts', params);
    },
    onMutate: async (params) => {
      const previousData =
        queryClient.getQueryData<AccountsAndCharactersResponse>(
          queryKeys.accountsAndCharacters()
        );

      if (previousData) {
        queryClient.setQueryData<AccountsAndCharactersResponse>(
          queryKeys.accountsAndCharacters(),
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

      await queryClient.cancelQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });

      return { previousData };
    },
    onError: (_err, _newOrder, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.accountsAndCharacters(),
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useReorderCharactersInAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderCharactersInAccountParams) => {
      return await invoke('reorder_characters_in_account', params);
    },
    onMutate: async (params) => {
      const previousData =
        queryClient.getQueryData<AccountsAndCharactersResponse>(
          queryKeys.accountsAndCharacters()
        );

      if (previousData) {
        queryClient.setQueryData<AccountsAndCharactersResponse>(
          queryKeys.accountsAndCharacters(),
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

      await queryClient.cancelQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });

      return { previousData };
    },
    onError: (_err, _params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.accountsAndCharacters(),
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}

export function useReorderUnassignedCharacters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderUnassignedCharactersParams) => {
      return await invoke('reorder_unassigned_characters', params);
    },
    onMutate: async (params) => {
      const previousData =
        queryClient.getQueryData<AccountsAndCharactersResponse>(
          queryKeys.accountsAndCharacters()
        );

      if (previousData) {
        queryClient.setQueryData<AccountsAndCharactersResponse>(
          queryKeys.accountsAndCharacters(),
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

      await queryClient.cancelQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });

      return { previousData };
    },
    onError: (_err, _params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.accountsAndCharacters(),
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}
