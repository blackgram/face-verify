import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getApiLogs, subscribeApiLogs, clearApiLogs, type ApiLogEntry } from '../api/apiLogger';

export default function ApiLogOverlay() {
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<readonly ApiLogEntry[]>(getApiLogs());

  useEffect(() => subscribeApiLogs(() => setLogs([...getApiLogs()])), []);

  const latestCount = logs.length;

  return (
    <>
      {/* Floating badge */}
      <Pressable style={styles.fab} onPress={() => setVisible(true)}>
        <Text style={styles.fabText}>API {latestCount > 0 ? `(${latestCount})` : ''}</Text>
      </Pressable>

      {/* Modal log viewer */}
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTouchable} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>API Logs</Text>
              <View style={styles.headerActions}>
                <Pressable onPress={clearApiLogs} style={styles.clearBtn}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
                <Pressable onPress={() => setVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView style={styles.logList} contentContainerStyle={styles.logListContent}>
              {logs.length === 0 && <Text style={styles.empty}>No API calls yet.</Text>}
              {logs.map((log) => (
                <LogItem key={log.id} log={log} />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function LogItem({ log }: { log: ApiLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isError = log.error != null || (log.status != null && log.status >= 400);
  const statusColor = isError ? '#ef4444' : '#22c55e';
  const time = log.timestamp.slice(11, 19);

  return (
    <Pressable style={styles.logItem} onPress={() => setExpanded(!expanded)}>
      <View style={styles.logRow}>
        <Text style={[styles.logMethod, { color: statusColor }]}>{log.method}</Text>
        <Text style={styles.logStatus}>{log.status ?? '...'}</Text>
        {log.durationMs != null && <Text style={styles.logDuration}>{log.durationMs}ms</Text>}
        <Text style={styles.logTime}>{time}</Text>
      </View>
      <Text style={styles.logUrl} numberOfLines={expanded ? undefined : 1}>{log.url}</Text>
      {expanded && (
        <View style={styles.logDetail}>
          {log.requestBody && (
            <>
              <Text style={styles.detailLabel}>Request:</Text>
              <Text style={styles.detailBody} selectable>{log.requestBody}</Text>
            </>
          )}
          {log.responseBody && (
            <>
              <Text style={styles.detailLabel}>Response:</Text>
              <Text style={styles.detailBody} selectable>{log.responseBody}</Text>
            </>
          )}
          {log.error && (
            <>
              <Text style={[styles.detailLabel, { color: '#ef4444' }]}>Error:</Text>
              <Text style={[styles.detailBody, { color: '#ef4444' }]} selectable>{log.error}</Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 50,
    right: 16,
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: { color: '#e2e8f0', fontSize: 12, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  backdropTouchable: { flex: 1 },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  headerTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearText: { color: '#94a3b8', fontSize: 13 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { color: '#94a3b8', fontSize: 18, fontWeight: '700' },

  logList: { flex: 1 },
  logListContent: { padding: 12, gap: 8 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 14 },

  logItem: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logMethod: { fontSize: 12, fontWeight: '800' },
  logStatus: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  logDuration: { color: '#94a3b8', fontSize: 11 },
  logTime: { color: '#64748b', fontSize: 11, marginLeft: 'auto' },
  logUrl: { color: '#94a3b8', fontSize: 11, marginTop: 4 },

  logDetail: { marginTop: 8, gap: 4 },
  detailLabel: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  detailBody: { color: '#94a3b8', fontSize: 11, fontFamily: 'Courier' },
});
