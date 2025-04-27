variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1" # Or your preferred region
}

variable "cluster_name" {
  description = "Name for the EKS cluster"
  type        = string
  default     = "techdeck-eks-cluster"
}

variable "db_username" {
  description = "Username for the RDS PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Password for the RDS PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Name for the RDS PostgreSQL database"
  type        = string
  default     = "webappdb"
}

variable "s3_bucket_name" {
  description = "Unique name for the S3 bucket for application assets"
  type        = string
}

# TODO: Add more variables as needed
# e.g., VPC CIDR, subnet CIDRs, instance types, desired node count, etc.

# variable "vpc_cidr" {
#   description = "CIDR block for the VPC"
#   type        = string
#   default     = "10.0.0.0/16"
# }

# variable "node_instance_type" {
#   description = "EC2 instance type for EKS worker nodes"
#   type        = string
#   default     = "t3.medium"
# }

# variable "desired_node_count" {
#   description = "Desired number of EKS worker nodes"
#   type        = number
#   default     = 2
# }

# variable "min_node_count" {
#   description = "Minimum number of EKS worker nodes for auto-scaling"
#   type        = number
#   default     = 2
# }

# variable "max_node_count" {
#   description = "Maximum number of EKS worker nodes for auto-scaling"
#   type        = number
#   default     = 4
# } 