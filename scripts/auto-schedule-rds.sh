#!/bin/bash

# Serenya Development Infrastructure - AUTO SCHEDULE RDS
# Automated RDS start/stop scheduling for maximum cost savings
# Run this script once to set up automated cost optimization

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
DB_INSTANCE="serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog"
SCRIPT_DIR="/Users/m00n5h075ai/development/serenya/scripts"

echo "⏰ SERENYA AUTOMATED RDS SCHEDULING SETUP"
echo "This will configure automatic start/stop of RDS for cost optimization"
echo ""

# Function to check if AWS CLI is configured
check_aws_config() {
    if ! $AWS_CLI sts get-caller-identity --region $REGION >/dev/null 2>&1; then
        echo "❌ AWS CLI not configured or no access to region $REGION"
        exit 1
    fi
}

# Function to create cron jobs
setup_cron_schedule() {
    echo "📅 Setting up cron schedule for RDS automation..."
    echo ""
    echo "Recommended schedule options:"
    echo "1. Business hours (9 AM - 6 PM weekdays)"
    echo "2. Development hours (10 AM - 8 PM weekdays + Saturday morning)"
    echo "3. Extended hours (8 AM - 10 PM weekdays + weekends)"
    echo "4. Custom schedule"
    echo ""
    
    read -p "Choose schedule option (1-4): " SCHEDULE_OPTION
    
    case $SCHEDULE_OPTION in
        1)
            START_CRON="0 9 * * 1-5"  # 9 AM weekdays
            STOP_CRON="0 18 * * 1-5"  # 6 PM weekdays
            DESCRIPTION="Business hours (9 AM - 6 PM weekdays)"
            ;;
        2)
            START_CRON="0 10 * * 1-6"  # 10 AM weekdays + Saturday
            STOP_CRON="0 20 * * 1-6"   # 8 PM weekdays + Saturday
            DESCRIPTION="Development hours (10 AM - 8 PM, Mon-Sat)"
            ;;
        3)
            START_CRON="0 8 * * 1-7"   # 8 AM every day
            STOP_CRON="0 22 * * 1-7"   # 10 PM every day
            DESCRIPTION="Extended hours (8 AM - 10 PM daily)"
            ;;
        4)
            echo ""
            echo "Enter custom cron expressions:"
            read -p "Start time (e.g., '0 9 * * 1-5' for 9 AM weekdays): " START_CRON
            read -p "Stop time (e.g., '0 18 * * 1-5' for 6 PM weekdays): " STOP_CRON
            DESCRIPTION="Custom schedule"
            ;;
        *)
            echo "❌ Invalid option selected"
            exit 1
            ;;
    esac
    
    echo ""
    echo "📋 Schedule Summary:"
    echo "   Start RDS: $START_CRON"
    echo "   Stop RDS: $STOP_CRON"
    echo "   Description: $DESCRIPTION"
    echo ""
    
    read -p "Proceed with this schedule? (y/N): " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "❌ Schedule setup cancelled"
        exit 1
    fi
    
    # Add cron jobs
    echo "⚙️  Adding cron jobs..."
    
    # Remove existing Serenya cron jobs
    (crontab -l 2>/dev/null | grep -v "# Serenya RDS") | crontab - 2>/dev/null || true
    
    # Add new cron jobs
    (crontab -l 2>/dev/null; echo "$START_CRON $SCRIPT_DIR/start-dev-infrastructure.sh >> /tmp/serenya-rds-start.log 2>&1 # Serenya RDS Auto Start") | crontab -
    (crontab -l 2>/dev/null; echo "$STOP_CRON $SCRIPT_DIR/stop-dev-infrastructure.sh >> /tmp/serenya-rds-stop.log 2>&1 # Serenya RDS Auto Stop") | crontab -
    
    echo "✅ Cron schedule configured successfully"
}

# Function to show current schedule
show_current_schedule() {
    echo "📋 Current Serenya RDS Schedule:"
    crontab -l 2>/dev/null | grep "# Serenya RDS" || echo "   No automated schedule configured"
    echo ""
}

# Function to remove schedule
remove_schedule() {
    echo "🗑️  Removing automated RDS schedule..."
    (crontab -l 2>/dev/null | grep -v "# Serenya RDS") | crontab - 2>/dev/null || true
    echo "✅ Automated schedule removed"
}

# Function to calculate potential savings
calculate_savings() {
    echo "💰 POTENTIAL COST SAVINGS:"
    echo ""
    echo "RDS db.t3.micro costs in eu-west-1:"
    echo "   • Running 24/7: ~$11.00/month"
    echo "   • Business hours (9 AM - 6 PM weekdays): ~$3.30/month (70% savings)"
    echo "   • Development hours (10 AM - 8 PM, Mon-Sat): ~$4.40/month (60% savings)"
    echo "   • Extended hours (8 AM - 10 PM daily): ~$6.60/month (40% savings)"
    echo ""
    echo "Additional costs (always running):"
    echo "   • Storage 20GB gp2: ~$2.00/month"
    echo "   • Lambda functions: ~$0.10-0.50/month"
    echo "   • Other services: ~$0.50/month"
    echo ""
    echo "📊 Total potential monthly savings:"
    echo "   • Business hours: $7.70 saved (~70% total reduction)"
    echo "   • Development hours: $6.60 saved (~60% total reduction)"
    echo "   • Extended hours: $4.40 saved (~40% total reduction)"
}

# Main menu
main_menu() {
    echo "Choose an action:"
    echo "1. Set up automated RDS schedule"
    echo "2. Show current schedule"
    echo "3. Remove automated schedule"
    echo "4. Calculate potential savings"
    echo "5. Exit"
    echo ""
    
    read -p "Select option (1-5): " MENU_CHOICE
    
    case $MENU_CHOICE in
        1)
            setup_cron_schedule
            ;;
        2)
            show_current_schedule
            ;;
        3)
            remove_schedule
            ;;
        4)
            calculate_savings
            ;;
        5)
            echo "✅ Exiting"
            exit 0
            ;;
        *)
            echo "❌ Invalid option"
            exit 1
            ;;
    esac
}

# Main execution
echo "🔍 Checking AWS configuration..."
check_aws_config
echo "✅ AWS CLI configured correctly"

echo ""
show_current_schedule

calculate_savings

echo ""
main_menu

echo ""
echo "📝 NOTES:"
echo "   • Logs are written to /tmp/serenya-rds-start.log and /tmp/serenya-rds-stop.log"
echo "   • You can manually override schedule with start/stop scripts anytime"
echo "   • Schedule runs on your local machine (must be running at scheduled times)"
echo "   • Consider using AWS Systems Manager for cloud-based scheduling"
echo ""
echo "✅ RDS scheduling configuration complete!"