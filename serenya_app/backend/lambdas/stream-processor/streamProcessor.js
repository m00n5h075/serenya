const { ObservabilityService } = require('../shared/observability-service');

/**
 * DynamoDB Stream Processor for Observability and Business Intelligence
 * Processes table events to generate real-time metrics and business insights
 */
exports.handler = async (event) => {
  const observability = ObservabilityService.createForFunction('stream-processor', event);

  console.log('Stream processor invoked with records:', event.Records.length);

  try {
    for (const record of event.Records) {
      await processRecord(record, observability);
    }

    console.log('Successfully processed all stream records');
  } catch (error) {
    console.error('Error processing stream records:', error);
    await observability.trackError(error, 'stream_processing', null, {
      recordCount: event.Records.length
    });
    throw error;
  }
};

/**
 * Process individual DynamoDB stream record
 */
async function processRecord(record, observability) {
  const eventName = record.eventName; // INSERT, MODIFY, REMOVE
  const tableName = record.eventSourceARN.split('/')[1];

  // Track table activity
  await observability.publishMetric('DynamoDBStreamEvents', 1, 'Count', {
    Environment: process.env.ENVIRONMENT,
    TableName: tableName,
    EventType: eventName
  }, 'Serenya/Database');

  if (!record.dynamodb.NewImage) {
    return;
  }

  const newImage = unmarshallDynamoDBItem(record.dynamodb.NewImage);
  const oldImage = record.dynamodb.OldImage ? unmarshallDynamoDBItem(record.dynamodb.OldImage) : null;

  // Extract PK and SK to determine entity type
  const pk = newImage.PK || '';
  const sk = newImage.SK || '';

  // Process based on entity type
  if (pk.startsWith('USER#')) {
    await processUserEvent(eventName, newImage, oldImage, observability);
  } else if (pk.startsWith('JOB#')) {
    await processJobEvent(eventName, newImage, oldImage, observability);
  } else if (pk.startsWith('CHAT#')) {
    await processChatEvent(eventName, newImage, oldImage, observability);
  } else if (pk.startsWith('SUBSCRIPTION#')) {
    await processSubscriptionEvent(eventName, newImage, oldImage, observability);
  }
}

/**
 * Process user-related events
 */
async function processUserEvent(eventName, newImage, oldImage, observability) {
  const userId = newImage.PK.replace('USER#', '');

  if (eventName === 'INSERT') {
    // New user registration
    await observability.publishMetric('NewUserRegistrations', 1, 'Count', {
      Environment: process.env.ENVIRONMENT,
      Provider: newImage.auth_provider || 'unknown'
    }, 'Serenya/Business');

    await observability.logEvent('user_registration', userId, {
      authProvider: newImage.auth_provider,
      hasCompletedOnboarding: newImage.has_completed_onboarding,
      createdAt: newImage.created_at
    });
  } else if (eventName === 'MODIFY') {
    // Track onboarding completion
    if (!oldImage?.has_completed_onboarding && newImage.has_completed_onboarding) {
      await observability.publishMetric('OnboardingCompletions', 1, 'Count', {
        Environment: process.env.ENVIRONMENT
      }, 'Serenya/Business');

      await observability.trackUserJourney('onboarding_completed', userId);
    }

    // Track biometric enrollment
    if (!oldImage?.biometric_enabled && newImage.biometric_enabled) {
      await observability.publishMetric('BiometricEnrollments', 1, 'Count', {
        Environment: process.env.ENVIRONMENT
      }, 'Serenya/Security');
    }
  }
}

/**
 * Process job/document processing events
 */
async function processJobEvent(eventName, newImage, oldImage, observability) {
  const userId = newImage.user_id;
  const jobId = newImage.PK.replace('JOB#', '');

  if (eventName === 'INSERT') {
    // New job created
    await observability.publishMetric('JobsCreated', 1, 'Count', {
      Environment: process.env.ENVIRONMENT,
      JobType: newImage.job_type || 'unknown'
    }, 'Serenya/Jobs');

    await observability.trackUserJourney('document_upload_started', userId, {
      jobId,
      jobType: newImage.job_type
    });
  } else if (eventName === 'MODIFY') {
    const oldStatus = oldImage?.status;
    const newStatus = newImage.status;

    // Track status transitions
    if (oldStatus !== newStatus) {
      await observability.publishMetric('JobStatusChanges', 1, 'Count', {
        Environment: process.env.ENVIRONMENT,
        FromStatus: oldStatus || 'none',
        ToStatus: newStatus,
        JobType: newImage.job_type || 'unknown'
      }, 'Serenya/Jobs');

      // Track completion
      if (newStatus === 'completed') {
        const processingTime = newImage.completed_at && newImage.created_at
          ? new Date(newImage.completed_at).getTime() - new Date(newImage.created_at).getTime()
          : null;

        await observability.publishMetric('JobCompletions', 1, 'Count', {
          Environment: process.env.ENVIRONMENT,
          JobType: newImage.job_type || 'unknown'
        }, 'Serenya/Jobs');

        if (processingTime) {
          await observability.publishMetric('JobProcessingDuration', processingTime, 'Milliseconds', {
            Environment: process.env.ENVIRONMENT,
            JobType: newImage.job_type || 'unknown'
          }, 'Serenya/Jobs');
        }

        await observability.trackUserJourney('document_processing_completed', userId, {
          jobId,
          processingTime
        });
      } else if (newStatus === 'failed') {
        await observability.publishMetric('JobFailures', 1, 'Count', {
          Environment: process.env.ENVIRONMENT,
          JobType: newImage.job_type || 'unknown',
          ErrorCode: newImage.error_code || 'unknown'
        }, 'Serenya/Jobs');
      }
    }
  }
}

/**
 * Process chat/AI interaction events
 */
async function processChatEvent(eventName, newImage, oldImage, observability) {
  const userId = newImage.user_id;

  if (eventName === 'INSERT') {
    // New chat message
    await observability.publishMetric('ChatMessages', 1, 'Count', {
      Environment: process.env.ENVIRONMENT,
      MessageType: newImage.role || 'unknown'
    }, 'Serenya/Chat');

    if (newImage.role === 'user') {
      await observability.trackUserJourney('chat_message_sent', userId, {
        contentType: newImage.content_type
      });
    }
  }
}

/**
 * Process subscription events
 */
async function processSubscriptionEvent(eventName, newImage, oldImage, observability) {
  const userId = newImage.user_id;

  if (eventName === 'INSERT') {
    // New subscription
    await observability.trackSubscription('created', userId, newImage.subscription_type, {
      plan: newImage.plan_type,
      billingCycle: newImage.billing_cycle
    });
  } else if (eventName === 'MODIFY') {
    const oldStatus = oldImage?.status;
    const newStatus = newImage.status;
    const oldType = oldImage?.subscription_type;
    const newType = newImage.subscription_type;

    // Track subscription type changes (conversions)
    if (oldType !== newType && oldType === 'free' && newType === 'premium') {
      await observability.trackSubscription('conversion', userId, newType, {
        fromPlan: oldType,
        toPlan: newType,
        billingCycle: newImage.billing_cycle
      });
    }

    // Track cancellations
    if (oldStatus === 'active' && newStatus === 'cancelled') {
      await observability.trackSubscription('cancelled', userId, newImage.subscription_type, {
        cancelledAt: newImage.cancelled_at,
        reason: newImage.cancellation_reason
      });
    }
  }
}

/**
 * Unmarshall DynamoDB item from stream format
 */
function unmarshallDynamoDBItem(item) {
  const unmarshalled = {};
  for (const [key, value] of Object.entries(item)) {
    if (value.S !== undefined) unmarshalled[key] = value.S;
    else if (value.N !== undefined) unmarshalled[key] = parseFloat(value.N);
    else if (value.BOOL !== undefined) unmarshalled[key] = value.BOOL;
    else if (value.NULL !== undefined) unmarshalled[key] = null;
    else if (value.M !== undefined) unmarshalled[key] = unmarshallDynamoDBItem(value.M);
    else if (value.L !== undefined) unmarshalled[key] = value.L.map(v => unmarshallDynamoDBItem({ item: v }).item);
  }
  return unmarshalled;
}
