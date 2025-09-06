# Serenya AWS Cost Optimization Scripts

These scripts help you manage AWS infrastructure costs during development by starting/stopping resources as needed.

## 🎯 Cost Optimization Strategy

| Scenario | Monthly Cost | Savings | Script |
|----------|--------------|---------|--------|
| Full Infrastructure (24/7) | ~$15 | 0% | Default |
| RDS Stopped (development) | ~$4 | 70% | `stop-dev-infrastructure.sh` |
| Complete Pause (long breaks) | ~$0.50 | 95% | `pause-development.sh` |

## 📜 Available Scripts

### 1. 🛑 Stop Development Infrastructure
```bash
./scripts/stop-dev-infrastructure.sh
```
- **Purpose**: Stop expensive RDS during non-development hours
- **Savings**: ~70% reduction (~$11/month saved)
- **Time**: 2-3 minutes to stop
- **Use When**: End of development session, overnight, weekends

### 2. 🚀 Start Development Infrastructure  
```bash
./scripts/start-dev-infrastructure.sh
```
- **Purpose**: Start RDS for development/testing sessions
- **Time**: 2-3 minutes to start
- **Use When**: Beginning development session, testing mobile app

### 3. ⏸️ Pause Development (Complete Shutdown)
```bash
./scripts/pause-development.sh
```
- **Purpose**: Delete entire CloudFormation stack for long breaks
- **Savings**: ~95% reduction (near $0/month)
- **Time**: 5-10 minutes to delete
- **Use When**: Extended breaks (1+ weeks), vacation, between development phases
- **⚠️ WARNING**: Deletes all AWS resources! Creates database backup if possible.

### 4. 🔄 Resume Development (Complete Restore)
```bash
./scripts/resume-development.sh
```
- **Purpose**: Redeploy complete infrastructure after pause
- **Time**: 8-12 minutes to deploy
- **Use When**: Resuming after complete pause
- **Features**: Can restore database from backup

### 5. 💰 Check AWS Costs
```bash
./scripts/check-aws-costs.sh
```
- **Purpose**: Monitor current AWS costs and get optimization recommendations
- **Features**: Shows cost breakdown, projections, and recommendations
- **Use When**: Weekly cost monitoring, before/after optimizations

### 6. 🔍 Quick Status Check
```bash
./scripts/dev-status.sh
```
- **Purpose**: Fast overview of infrastructure status and cost optimization tips
- **Features**: RDS status, stack health, quick action recommendations
- **Use When**: Daily development workflow, before starting/stopping work

### 7. ⏰ Automated RDS Scheduling
```bash
./scripts/auto-schedule-rds.sh
```
- **Purpose**: Set up automated start/stop scheduling for maximum cost savings
- **Features**: Cron-based scheduling, multiple preset options, custom schedules
- **Use When**: One-time setup for hands-free cost optimization

## 🔄 Recommended Development Workflow

### Daily Development
```bash
# Start development session
./scripts/start-dev-infrastructure.sh

# ... develop and test ...

# End development session  
./scripts/stop-dev-infrastructure.sh
```

### Weekly Cost Check
```bash
# Monitor costs and get recommendations
./scripts/check-aws-costs.sh
```

### Extended Breaks (1+ weeks)
```bash
# Before break
./scripts/pause-development.sh

# When resuming
./scripts/resume-development.sh
```

## ⚙️ Technical Details

### Infrastructure Components

**Always Running (Low Cost):**
- Lambda Functions: ~$0.10-0.50/month (only pay for invocations)
- API Gateway: ~$0.30/month (minimal usage)
- S3 Bucket: ~$0.01/month (empty)
- KMS Key: ~$0.03/month

**Major Cost Drivers:**
- RDS PostgreSQL db.t3.micro: ~$11/month (24/7)
- RDS Storage 20GB gp2: ~$2/month

### Prerequisites

**Required Tools:**
- AWS CLI configured for `eu-west-1`
- Access to account `625819760139`
- CDK for complete pause/resume
- PostgreSQL client tools (for backup/restore)

**Permissions Needed:**
- RDS start/stop permissions
- CloudFormation full access (for pause/resume)
- Secrets Manager read access
- Cost Explorer read access (for cost monitoring)

## 🚨 Important Notes

### Security
- Database backups are created locally before complete pause
- All scripts use secure AWS CLI authentication
- No credentials are stored in scripts

### Data Safety
- **stop/start**: No data loss, just stops/starts RDS instance
- **pause/resume**: Creates backup before deletion, offers restore after deployment
- Always test backup/restore process before relying on it

### Development Impact
- **stop/start**: No code changes needed, just infrastructure availability
- **pause/resume**: May need to update API endpoints if they change
- Mobile app continues to work with local development mode

## 💡 Cost Optimization Tips

1. **Use RDS scheduling**: Stop RDS nights/weekends for consistent 70% savings
2. **Set billing alerts**: Monitor at $5/month threshold during development
3. **Complete pause for breaks**: Use pause/resume for vacations or extended breaks
4. **Local development**: Use local PostgreSQL for day-to-day coding, AWS for testing
5. **Batch testing**: Group testing sessions to minimize start/stop cycles

## 🆘 Troubleshooting

### RDS Won't Start/Stop
```bash
# Check RDS status
aws rds describe-db-instances --db-instance-identifier serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog --region eu-west-1 --query 'DBInstances[0].DBInstanceStatus'

# May need to wait if in transition state (starting/stopping/backing-up)
```

### Stack Deletion Fails
```bash
# Check stack events
aws cloudformation describe-stack-events --stack-name serenya-backend-dev --region eu-west-1

# May need manual cleanup of stuck resources
```

### Cost Monitoring Issues
```bash
# Check AWS CLI permissions
aws sts get-caller-identity
aws ce get-cost-and-usage --time-period Start=2025-09-01,End=2025-10-01 --granularity MONTHLY --metrics BlendedCost
```

## 📞 Support

If you encounter issues:
1. Check AWS console for detailed error messages
2. Verify AWS CLI permissions and region settings  
3. Ensure all required tools are installed
4. Check script logs for specific error details

---

**💰 Expected Result**: Reduce AWS costs from ~$15/month to $2-4/month during active development, or near $0 during extended breaks.