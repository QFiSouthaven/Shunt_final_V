// components/framework/types.ts
export interface Hyperparameters {
  learningRate: number;
  gamma: number;
  epsilonStart: number;
  epsilonEnd: number;
  epsilonDecay: number;
  numEpisodes: number;
  batchSize: number;
  bufferCapacity: number;
}

export interface Metrics {
    episode: number;
    totalReward: number;
    avgReward: number;
    loss: number;
    rewardHistory: { episode: number, reward: number }[];
}

export interface LogEntry {
    id: string;
    timestamp: string;
    message: string;
}

export interface LiveInspectorData {
    epsilon: number;
    bufferSize: number;
    qValues: { [key: string]: number };
    log: LogEntry[];
}
