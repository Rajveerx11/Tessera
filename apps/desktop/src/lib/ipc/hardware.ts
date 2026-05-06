import { type HardwareInfo, HardwareInfoSchema } from '@testing-ide/shared';

import { invokeAndParse } from './invoke';

/**
 * Probes system hardware (RAM + GPU) and returns a model recommendation.
 *
 * Per Phase 8: this replaces the purely RAM-based recommendation logic in
 * the frontend with a robust backend check that also handles NVIDIA GPUs.
 */
export async function detectHardware(): Promise<HardwareInfo> {
  return invokeAndParse('detect_hardware', HardwareInfoSchema);
}
