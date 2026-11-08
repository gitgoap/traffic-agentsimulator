'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunResult, Snapshot } from '../simulation/engine';
import type { Scenario } from '../simulation/schema';
import type { Command, Reply } from '../workers/protocol';

export function useSimulation(scenario: Scenario) {
  const worker = useRef<Worker | null>(null),
    run = useRef(0);
  const pending = useRef<{
    resolve: (result: RunResult) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [running, setRunning] = useState(false),
    [error, setError] = useState('');
  const [allRed, setAllRed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const w = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url));
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.runId !== run.current) return;
      if (data.type === 'state') {
        setSnapshot(data.snapshot);
        setRunning(data.running);
      }
      if (data.type === 'error') {
        setError(data.message);
        setRunning(false);
        pending.current?.reject(new Error(data.message));
        pending.current = null;
      }
      if (data.type === 'result') {
        pending.current?.resolve(data.result);
        pending.current = null;
      }
    };
    w.onerror = () => {
      setError('The simulation worker stopped. Reset to try again.');
      setRunning(false);
      pending.current?.reject(new Error('Worker stopped.'));
      pending.current = null;
    };
    return () => {
      w.terminate();
      worker.current = null;
      pending.current?.reject(new Error('Simulation closed.'));
      pending.current = null;
    };
  }, []);
  useEffect(() => {
    run.current++;
    pending.current?.reject(new Error('The scenario was reset.'));
    pending.current = null;
    setRunning(false);
    setSnapshot(null);
    setError('');
    setAllRed(false);
    worker.current?.postMessage({ type: 'init', scenario, runId: run.current } satisfies Command);
  }, [scenario, revision]);
  const send = useCallback(
    (
      command:
        | Omit<Extract<Command, { type: 'brake' }>, 'runId'>
        | Omit<Extract<Command, { type: 'all-red' }>, 'runId'>
        | { type: 'play' | 'pause' | 'step' }
        | { type: 'speed'; speed: number },
    ) => {
      if (command.type === 'all-red') setAllRed(command.enabled);
      worker.current?.postMessage({ ...command, runId: run.current });
    },
    [],
  );
  useEffect(() => {
    const pause = () => {
      if (document.hidden) send({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, [send]);
  const getResult = () =>
    new Promise<RunResult>((resolve, reject) => {
      if (pending.current) {
        reject(new Error('A result request is already in progress.'));
        return;
      }
      if (!worker.current || !snapshot) {
        reject(new Error('The simulation is still loading.'));
        return;
      }
      pending.current = { resolve, reject };
      worker.current.postMessage({ type: 'result', runId: run.current } satisfies Command);
    });
  return {
    snapshot,
    running,
    error,
    allRed,
    send,
    reset: () => setRevision((x) => x + 1),
    getResult,
  };
}

export function experiment(
  scenario: Scenario,
  seeds: number[],
  signal?: AbortSignal,
): Promise<RunResult[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Experiment cancelled.'));
      return;
    }
    const worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url));
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      finish();
      reject(new Error('Experiment cancelled.'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => {
      finish();
      reject(new Error('Experiment worker failed.'));
    };
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.type === 'experiment') {
        finish();
        resolve(data.results);
      }
      if (data.type === 'error') {
        finish();
        reject(new Error(data.message));
      }
    };
    worker.postMessage({ type: 'init', scenario, runId: 1 } satisfies Command);
    worker.postMessage({ type: 'experiment', scenario, seeds, runId: 1 } satisfies Command);
  });
}
