import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsInput,
} from "@getpaseo/plugin/client/ui";
import {
  getNativeStatus,
  readSettings,
  saveSettings,
  type Settings,
  type SourceMode,
} from "../shared/contracts";
import { Action } from "./card";

const options: { label: string; value: SourceMode }[] = [
  { label: "Auto (prefer native)", value: "auto" },
  { label: "Native turn diff", value: "native" },
  { label: "Plugin-collected edits", value: "edits" },
];

export function SourcesSettings({ theme, host }: PluginSurfaceProps) {
  const read = useRpc(readSettings);
  const save = useRpc(saveSettings);
  const readNative = useRpc(getNativeStatus);
  const native = useQuery({ queryKey: [host.id, "native-status"], queryFn: () => readNative({}) });
  const queries = useQueryClient();
  const key = [host.id, "turn-changes-settings"];
  const query = useQuery({ queryKey: key, queryFn: () => read({}) });
  const [provider, setProvider] = useState("");
  const mutation = useMutation({
    mutationFn: (values: Settings) => {
      if (!query.data) throw new Error("Settings have not finished loading.");
      return save({ revision: query.data.revision, values });
    },
    onSuccess: (value) => queries.setQueryData(key, value),
  });
  if (query.isPending)
    return <Text style={{ color: theme.colors.foregroundMuted }}>Loading settings…</Text>;
  if (query.isError)
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.colors.statusDanger }}>{query.error.message}</Text>
        <Action theme={theme} label="Reload" onPress={() => void query.refetch()} />
      </View>
    );
  const values = query.data.values;
  return (
    <View style={{ gap: 20 }} testID="turn-changes-settings">
      <Text style={{ color: theme.colors.foregroundMuted }}>
        Choose the diff source per agent backend. Changes apply from the next turn; recorded history is left as is.
      </Text>
      <SettingsSection title="Data source">
        <SettingsCard>
          {Object.entries(values.providers).map(([id, source]) => (
            <View key={id} style={{ gap: 8 }}>
              <SettingsSelect
                label={id}
                value={source}
                options={options}
                disabled={mutation.isPending}
                onValueChange={(next) =>
                  mutation.mutate({ ...values, providers: { ...values.providers, [id]: next } })
                }
              />
              {source !== "edits" && (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                  {native.isError
                    ? `Failed to read native data status: ${native.error.message}`
                    : native.data?.[id]
                      ? `Last turn: ${native.data[id].available ? "native signal received" : source === "auto" ? "no native signal, using plugin-collected edits" : "no native signal, the integration patch is required"} (${new Date(native.data[id].observedAt).toLocaleString()})`
                      : "Native support not confirmed yet. Finish one turn after enabling to check."}
                </Text>
              )}
              <Action
                theme={theme}
                label={`Remove override for ${id}`}
                disabled={mutation.isPending}
                onPress={() => {
                  const providers = { ...values.providers };
                  delete providers[id];
                  mutation.mutate({ ...values, providers });
                }}
              />
            </View>
          ))}
          <SettingsSelect
            label="Other agent backends"
            value={values.defaultSource}
            options={options}
            disabled={mutation.isPending}
            onValueChange={(defaultSource) => mutation.mutate({ ...values, defaultSource })}
          />
        </SettingsCard>
      </SettingsSection>
      <Action theme={theme} label="Refresh native data status" onPress={() => void native.refetch()} />
      <SettingsSection title="Add override">
        <SettingsCard>
          <SettingsInput
            label="Agent backend id"
            placeholder="e.g. claude or claude-super-relay"
            initialValue=""
            onChangeText={setProvider}
            disabled={mutation.isPending}
          />
        </SettingsCard>
        <Action
          theme={theme}
          label="Add"
          disabled={
            mutation.isPending ||
            !provider.trim() ||
            provider.trim().length > 120 ||
            Object.hasOwn(values.providers, provider.trim())
          }
          onPress={() =>
            mutation.mutate({
              ...values,
              providers: { ...values.providers, [provider.trim()]: values.defaultSource },
            })
          }
        />
      </SettingsSection>
      {mutation.isPending && <Text style={{ color: theme.colors.foregroundMuted }}>Saving…</Text>}
      {mutation.isSuccess && (
        <Text style={{ color: theme.colors.statusSuccess }}>Settings saved, they apply from the next turn.</Text>
      )}
      {mutation.isError && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.statusDanger }}>{mutation.error.message}</Text>
          <Action
            theme={theme}
            label="Refresh settings"
            onPress={() => {
              mutation.reset();
              void query.refetch();
            }}
          />
        </View>
      )}
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        Auto uses the native diff each turn and falls back to plugin-collected edits when there is no native signal. Choosing "Native turn diff" pins the source.
        Plugin-collected edits only cover structured file edits and can miss files written directly from the shell.
      </Text>
    </View>
  );
}
