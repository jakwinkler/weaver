import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { ConditionEvaluatorRegistry } from './condition-evaluator.registry';
import { PostFunctionRegistry } from './post-function.registry';

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService, ConditionEvaluatorRegistry, PostFunctionRegistry],
  exports: [WorkflowsService, ConditionEvaluatorRegistry, PostFunctionRegistry],
})
export class WorkflowsModule {}
