data "aws_caller_identity" "budget_account" {}

locals {
  budget_notification_email = coalesce(var.cost_budget_notification_email, var.ses_from_email)
}

resource "aws_budgets_budget" "monthly_cost" {
  count = var.enable_monthly_cost_budget_alarm ? 1 : 0

  name         = "${local.name_prefix}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_cost_budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "LinkedAccount"
    values = [data.aws_caller_identity.budget_account.account_id]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [local.budget_notification_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [local.budget_notification_email]
  }
}
