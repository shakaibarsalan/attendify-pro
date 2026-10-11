import { motion } from 'framer-motion';

interface Step {
  icon: string;
  label: string;
}

interface MultiStepVerifyProgressProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Set<number>;
}

export default function MultiStepVerifyProgress({
  steps,
  currentStep,
  completedSteps,
}: MultiStepVerifyProgressProps) {
  return (
    <div className="flex flex-col gap-3 w-full max-w-xs mx-auto" role="progressbar" aria-label="Verification progress">
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.has(idx);
        const isActive = idx === currentStep;
        const isPending = idx > currentStep;

        return (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.15, duration: 0.3 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
              isCompleted
                ? 'bg-green-50 border-green-200'
                : isActive
                  ? 'bg-blue-50 border-blue-200 shadow-sm'
                  : 'bg-gray-50 border-gray-100'
            }`}
          >
            <span className={`text-xl ${isPending ? 'opacity-30' : ''}`}>{step.icon}</span>
            <span
              className={`flex-1 text-sm font-medium ${
                isCompleted
                  ? 'text-green-700'
                  : isActive
                    ? 'text-blue-700'
                    : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
            {isCompleted && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-green-600 font-bold"
              >
                \u2713
              </motion.span>
            )}
            {isActive && !isCompleted && (
              <div className="w-5 h-5">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
